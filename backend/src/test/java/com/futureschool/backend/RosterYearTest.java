package com.futureschool.backend;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.futureschool.backend.entity.FeeCharge;
import com.futureschool.backend.entity.Student;
import com.futureschool.backend.entity.StudentEnrollment;
import com.futureschool.backend.repository.*;
import com.futureschool.backend.tenant.TenantContext;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDate;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Start-of-year roster, end to end on the seeded school (GVS):
 * prepare the next year -> fee schedule -> review + plan (promote, repeat, exit, add) -> start the year.
 * One ordered scenario on a fresh database; each step depends on the previous one.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
// Its own in-memory database (and so its own context): the year rollover it performs (new siblings,
// exited students, a new current year) must not leak into other test classes, which share "fs_test".
@org.springframework.test.context.TestPropertySource(properties =
        "spring.datasource.url=jdbc:h2:mem:fs_roster_year;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class RosterYearTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired StudentRepository students;
    @Autowired StudentEnrollmentRepository enrollments;
    @Autowired FeeChargeRepository charges;
    @Autowired FeePaymentRepository payments;
    @Autowired StudentAttendanceDayRepository attendanceDays;
    @Autowired UserAccountRepository accounts;
    @Autowired TransactionTemplate tx;

    Api api;

    static final String ROSTER = "/api/admin/roster/years";
    static final String AARAV = "GVS-2027-0001";   // 10-A, roll 18
    static final String AADHYA = "GVS-2027-0002";  // 10-A, leaves
    static final String KAVYA = "GVS-2028-0117";   // 9-A, repeats
    static final String RAJESH = "9876543210";     // existing parent (Aarav, Ananya, Rohan)
    static final String NEW_PARENT = "9123400001"; // no account yet

    static String currentId, nextId, nextName;
    static LocalDate nextStart, nextEnd;
    static List<Map<String, Object>> validDecisions;
    static List<Map<String, Object>> newStudents;
    static long aadhyaPayments, aadhyaAttendance;

    @BeforeEach
    void setUp() {
        api = new Api(mvc, json);
    }

    @AfterEach
    void clearTenant() {
        TenantContext.clear();
    }

    private String admin() throws Exception { // FINANCE, ADMISSIONS, SECURITY, REPORTS
        return api.staff("admin@greenwoodvalley.edu.in", "Greenwood@2026", "GVS");
    }

    private String office() throws Exception { // ACADEMIC_OPS, TRANSPORT, COMPLAINTS, REPORTS (no ADMISSIONS, no FINANCE)
        return api.staff("office@greenwoodvalley.edu.in", "Greenwood@2026", "GVS");
    }

    private <T> T inGvs(java.util.function.Supplier<T> body) {
        return TenantContext.callAs("GVS", () -> tx.execute(s -> body.get()));
    }

    @Test
    @Order(1)
    void onlySchoolAdminsWithAdmissionsCanPrepareAYear() throws Exception {
        String admin = admin();
        JsonNode years = api.getJson(ROSTER, admin);
        JsonNode current = years.get("current");
        currentId = current.get("id").asText();
        assertEquals("CURRENT", current.get("status").asText());
        int start = LocalDate.parse(current.get("startDate").asText()).getYear();
        nextName = (start + 1) + "-" + String.format("%02d", (start + 2) % 100);
        nextStart = LocalDate.of(start + 1, 6, 1);
        nextEnd = LocalDate.of(start + 2, 4, 30);
        Map<String, Object> body = Map.of("name", nextName, "startDate", nextStart.toString(), "endDate", nextEnd.toString());

        // Role checks (SecurityConfig) and permission checks (service): only an Admin holding ADMISSIONS.
        assertEquals(403, api.post(ROSTER, body, api.teacher("9848012345", "GVS")).get("_status").asInt());
        assertEquals(403, api.post(ROSTER, body, api.parent(RAJESH, AARAV)).get("_status").asInt());
        assertEquals(403, api.post(ROSTER, body, api.staff("principal@greenwoodvalley.edu.in", "Greenwood@2026", "GVS")).get("_status").asInt());
        JsonNode noPerm = api.post(ROSTER, body, office());
        assertEquals(403, noPerm.get("_status").asInt(), noPerm.toString());
        assertEquals(403, api.status(ROSTER, api.teacher("9848012345", "GVS")), "teachers cannot even read the roster plan");
        assertEquals(200, api.status(ROSTER, api.staff("principal@greenwoodvalley.edu.in", "Greenwood@2026", "GVS")), "the Principal can review it");

        // Validation.
        assertEquals("BAD_YEAR", api.post(ROSTER, Map.of("name", "next year", "startDate", nextStart.toString(), "endDate", nextEnd.toString()), admin).get("code").asText());
        assertEquals("BAD_DATES", api.post(ROSTER, Map.of("name", nextName, "startDate", nextStart.toString(), "endDate", nextStart.plusMonths(2).toString()), admin).get("code").asText());

        JsonNode created = api.post(ROSTER, body, admin);
        assertEquals(200, created.get("_status").asInt(), created.toString());
        nextId = created.get("id").asText();
        assertEquals("PLANNED", created.get("status").asText());
        // Safe to retry; conflicting dates are refused.
        assertEquals(nextId, api.post(ROSTER, body, admin).get("id").asText());
        assertEquals("YEAR_EXISTS", api.post(ROSTER, Map.of("name", nextName, "startDate", nextStart.plusDays(3).toString(), "endDate", nextEnd.toString()), admin).get("code").asText());
        assertEquals(2, api.getJson(ROSTER, admin).get("years").size(), "retries created no second year");
    }

    @Test
    @Order(2)
    void feeScheduleBelongsToTheYearAndOnlyFinanceSetsIt() throws Exception {
        String url = ROSTER + "/" + nextId + "/fee-schedule";
        List<Map<String, Object>> terms = List.of(
                Map.of("number", 1, "label", "Term 1", "dueOn", nextStart.plusDays(14).toString()),
                Map.of("number", 2, "label", "Term 2", "dueOn", nextStart.plusMonths(5).toString()),
                Map.of("number", 3, "label", "Term 3", "dueOn", nextStart.plusMonths(7).toString()),
                Map.of("number", 4, "label", "Term 4", "dueOn", nextStart.plusMonths(8).toString()));
        assertEquals(403, put(url, Map.of("instalments", terms), office()).get("_status").asInt(), "no FINANCE permission");
        String admin = admin();
        JsonNode outside = put(url, Map.of("instalments", List.of(Map.of("number", 1, "label", "Term 1", "dueOn", nextStart.minusDays(1).toString()))), admin);
        assertEquals("BAD_SCHEDULE", outside.get("code").asText(), "a due date outside the year is refused (never last year's dates)");
        JsonNode ok = put(url, Map.of("instalments", terms), admin);
        assertEquals(200, ok.get("_status").asInt(), ok.toString());
        assertEquals(4, ok.get("schedule").size());
        assertEquals(4, put(url, Map.of("instalments", terms), admin).get("schedule").size(), "setting it again changes nothing");
        // The current year's schedule is untouched.
        assertEquals(4, api.getJson("/api/staff/overview", admin).get("finance").get("byInstalment").size());
    }

    @Test
    @Order(3)
    void aBadPlanIsReportedRowByRowAndSavesNothing() throws Exception {
        String admin = admin();
        JsonNode draft = api.getJson(ROSTER + "/" + nextId + "/draft", admin);
        assertTrue(draft.get("planning").asBoolean());
        JsonNode aarav = rosterRow(draft, AARAV);
        assertTrue(aarav.has("needsDecision"), "no Class 11 yet: Aarav is not promoted automatically");
        assertFalse(aarav.has("saved"));

        List<Map<String, Object>> bad = List.of(
                Map.of("studentId", AARAV, "action", "PROMOTE", "toClassId", "GVS-9-A", "roll", "18"),   // wrong grade
                Map.of("studentId", KAVYA, "action", "REPEAT", "toClassId", "GVS-9-A", "roll", "03"),     // fine
                Map.of("studentId", KAVYA, "action", "REPEAT", "toClassId", "GVS-9-A", "roll", "03"),     // twice
                Map.of("studentId", AADHYA, "action", "EXIT", "exitReason", ""),                          // no reason
                Map.of("studentId", "SJM-2033-0105", "action", "PROMOTE", "toClassId", "GVS-10-A", "roll", "1")); // another school
        List<Map<String, Object>> badNew = List.of(newStudent("GVS-ADM-NX-1", "Ravi Teja", "GVS-9-A", "40", "Ravi's Father", "12345", null));
        JsonNode res = api.post(ROSTER + "/" + nextId + "/apply", Map.of("decisions", bad, "newStudents", badNew), admin);
        assertEquals(200, res.get("_status").asInt(), res.toString());
        assertFalse(res.get("applied").asBoolean());
        assertTrue(res.get("message").asText().contains("Nothing was saved"));
        assertEquals(5, res.get("summary").get("needsCorrection").asInt(), res.toString());
        Map<String, String> messages = new HashMap<>();
        for (JsonNode r : res.get("rows")) if ("ERROR".equals(r.get("status").asText())) messages.put(r.get("ref").asText(), r.get("message").asText());
        assertTrue(messages.get("decision 1").contains("Promotion goes to class 11"), messages.toString());
        assertTrue(messages.get("decision 3").contains("twice"), messages.toString());
        assertTrue(messages.get("decision 4").contains("reason"), messages.toString());
        assertTrue(messages.get("decision 5").contains("not found"), "another school's student is invisible: " + messages);
        assertTrue(messages.get("new student 1").contains("mobile"), messages.toString());
        assertFalse(res.toString().contains("password"), "no credentials in the result");

        assertTrue(inGvs(() -> enrollments.findByAcademicYearId(nextId).isEmpty()), "nothing was written");
        assertTrue(inGvs(() -> students.findByAdmissionNumber("GVS-ADM-NX-1").isEmpty()));
        assertEquals("UNDECIDED", api.post(ROSTER + "/" + nextId + "/start", Map.of(), admin).get("code").asText(), "a year cannot start with students undecided");
    }

    @Test
    @Order(4)
    void applyingAValidPlanIsAllOrNothingAndSafeToRepeat() throws Exception {
        // Class 11-A and 7-B exist for next year (ACADEMIC_OPS creates classes).
        String office = office();
        assertEquals(200, api.post("/api/classes", Map.of("name", "Class 11", "section", "A", "gradeNumber", 11, "schoolLevel", "Senior", "active", true), office).get("_status").asInt());
        assertEquals(200, api.post("/api/classes", Map.of("name", "Class 7", "section", "B", "gradeNumber", 7, "schoolLevel", "Middle", "active", true), office).get("_status").asInt());

        String admin = admin();
        JsonNode draft = api.getJson(ROSTER + "/" + nextId + "/draft", admin);
        validDecisions = new ArrayList<>();
        int extra = 0;
        for (JsonNode row : draft.get("roster")) {
            String sid = row.get("studentId").asText();
            if (sid.equals(AADHYA)) {
                validDecisions.add(Map.of("studentId", sid, "action", "EXIT", "exitReason", "Transferred to another school"));
            } else if (sid.equals(KAVYA)) {
                validDecisions.add(Map.of("studentId", sid, "action", "REPEAT", "toClassId", "GVS-9-A", "roll", "03"));
            } else if (row.has("suggestion")) { // the admin accepts the suggestion explicitly
                JsonNode s = row.get("suggestion");
                validDecisions.add(Map.of("studentId", sid, "action", "PROMOTE", "toClassId", s.get("toClassId").asText(), "roll", s.get("roll").asText()));
            } else { // e.g. 10-B: no 11-B, so into 11-A with a new roll
                validDecisions.add(Map.of("studentId", sid, "action", "PROMOTE", "toClassId", "GVS-11-A", "roll", "B" + (++extra)));
            }
        }
        newStudents = List.of(
                newStudent("GVS-ADM-NX-901", "Ishaan Sharma", "GVS-6-B", "01", "Rajesh Sharma", RAJESH, 30000L),
                newStudent("GVS-ADM-NX-902", "Diya Rao", "GVS-9-A", "21", "Lakshmi Rao", "+91 " + NEW_PARENT, 40000L));
        Map<String, Object> plan = Map.of("decisions", validDecisions, "newStudents", newStudents);
        int activeBefore = inGvs(() -> students.findByStatusIn(List.of("Active")).size());

        JsonNode preview = api.post(ROSTER + "/" + nextId + "/preview", plan, admin);
        assertEquals(200, preview.get("_status").asInt(), preview.toString());
        assertTrue(preview.get("dryRun").asBoolean());
        assertEquals(0, preview.get("summary").get("needsCorrection").asInt(), preview.toString());
        assertTrue(inGvs(() -> enrollments.findByAcademicYearId(nextId).isEmpty()), "a preview writes nothing");

        JsonNode res = api.post(ROSTER + "/" + nextId + "/apply", plan, admin);
        assertTrue(res.get("applied").asBoolean(), res.toString());
        JsonNode sum = res.get("summary");
        assertEquals(1, sum.get("exited").asInt());
        assertEquals(1, sum.get("repeated").asInt());
        assertEquals(2, sum.get("added").asInt());
        assertEquals(activeBefore - 2, sum.get("promoted").asInt());
        assertEquals(0, res.get("undecided").size(), "everyone has a decision");
        String text = res.toString();
        assertFalse(text.contains(NEW_PARENT), "the full mobile number is not echoed back");
        assertFalse(text.toLowerCase().contains("password"));
        assertTrue(text.contains("91••••••01"), "the masked number tells the admin which parent: " + text);

        // Nothing takes effect before the year starts.
        assertEquals("GVS-10-A", inGvs(() -> students.findById(AARAV).orElseThrow().getClassId()));
        Student diya = inGvs(() -> students.findByAdmissionNumber("GVS-ADM-NX-902").orElseThrow());
        assertEquals("Admitted", diya.getStatus());

        // Repeating the same plan changes nothing and creates no duplicates.
        JsonNode again = api.post(ROSTER + "/" + nextId + "/apply", plan, admin);
        JsonNode s2 = again.get("summary");
        assertEquals(0, s2.get("promoted").asInt() + s2.get("repeated").asInt() + s2.get("added").asInt() + s2.get("exited").asInt(), again.toString());
        assertEquals(validDecisions.size() + newStudents.size(), s2.get("skipped").asInt());
        int planned = inGvs(() -> enrollments.findByAcademicYearId(nextId).size());
        assertEquals(activeBefore - 1 + 2, planned, "one row per returning (not leaving) student plus each new student");
        assertEquals(1, inGvs(() -> students.findAll().stream().filter(s -> "Diya Rao".equals(s.getName())).count()).intValue());
        JsonNode dupAdd = api.post("/api/students", Map.of("admissionNumber", "GVS-ADM-NX-902", "name", "Diya Rao", "classId", "GVS-9-A",
                "className", "Class 9", "section", "A", "roll", "22"), admin);
        assertEquals("DUPLICATE_ADMISSION", dupAdd.get("code").asText(), "the single-student add refuses a repeat too");

        // The saved decisions show up when the plan is reopened.
        JsonNode reopened = api.getJson(ROSTER + "/" + nextId + "/draft", admin);
        assertEquals("PROMOTE", rosterRow(reopened, AARAV).get("saved").get("action").asText());
        assertEquals("EXIT", rosterRow(reopened, AADHYA).get("saved").get("action").asText());
        assertEquals(2, reopened.get("admitted").size());
    }

    @Test
    @Order(5)
    void newStudentsAreLinkedToTheRightParentWhoSignsInWithTheExistingFlow() throws Exception {
        String ishaan = inGvs(() -> students.findByAdmissionNumber("GVS-ADM-NX-901").orElseThrow().getId());
        String diya = inGvs(() -> students.findByAdmissionNumber("GVS-ADM-NX-902").orElseThrow().getId());

        // Existing parent: the sibling is added to Rajesh's account, no second account.
        assertEquals(1, accounts.findByMobile(RAJESH).stream().filter(a -> a.getRole() == com.futureschool.backend.entity.UserRole.PARENT).count());
        List<String> rajeshKids = childIds(RAJESH);
        assertTrue(rajeshKids.containsAll(List.of(AARAV, ishaan)), rajeshKids.toString());
        assertFalse(rajeshKids.contains(diya));

        // New parent: an account exists (no known password), and they sign in by OTP then set a PIN.
        var acc = accounts.findByMobile(NEW_PARENT).stream().filter(a -> a.getRole() == com.futureschool.backend.entity.UserRole.PARENT).findFirst().orElseThrow();
        assertNotNull(acc.getPassword());
        assertFalse(acc.getPassword().isBlank());
        assertEquals(List.of(diya), childIds(NEW_PARENT), "the new parent sees only their own child");
        String lakshmi = api.parent(NEW_PARENT, diya);
        assertEquals(403, api.status("/api/students/" + AARAV, lakshmi), "and cannot read another child");

        // Diya's dues are next year's fees, on next year's due dates.
        JsonNode fees = api.getJson("/api/parent/fees/summary", lakshmi);
        assertEquals(40000, fees.get("totalCharged").asLong());
        for (JsonNode ins : fees.get("instalments")) {
            for (JsonNode line : ins.get("lines")) {
                assertEquals(nextId, line.get("charge").get("academicYearId").asText());
                LocalDate due = LocalDate.parse(line.get("charge").get("dueOn").asText());
                assertFalse(due.isBefore(nextStart) || due.isAfter(nextEnd), "due " + due + " is inside " + nextName);
            }
        }
        // No online payment for this parent either.
        assertEquals(403, api.post("/api/parent/fees/orders", Map.of("amount", 1000), lakshmi).get("_status").asInt());
    }

    @Test
    @Order(6)
    void nextYearFeesAreChargedOnceAndDoNotTouchThisYearsClearance() throws Exception {
        String rajeshAarav = api.parent(RAJESH, AARAV);
        JsonNode ticketBefore = api.getJson("/api/parent/hall-tickets", rajeshAarav).get(0);
        long thisYearOutstanding = api.getJson("/api/parent/fees/summary", rajeshAarav).get("totalOutstanding").asLong();

        String admin = admin();
        Map<String, Object> fees = Map.of("annualFeeByGrade", Map.of("7", 30000, "9", 40000, "10", 42000, "11", 45000));
        assertEquals(403, api.post(ROSTER + "/" + nextId + "/fee-charges", fees, office()).get("_status").asInt(), "no FINANCE permission");
        JsonNode first = api.post(ROSTER + "/" + nextId + "/fee-charges", fees, admin);
        assertEquals(200, first.get("_status").asInt(), first.toString());
        assertTrue(first.get("studentsCharged").asInt() > 0);
        JsonNode second = api.post(ROSTER + "/" + nextId + "/fee-charges", fees, admin);
        assertEquals(0, second.get("studentsCharged").asInt(), "nobody is charged twice for the same year");

        // Aarav: 45,000 for next year (Class 11), split over next year's terms; this year's dues and clearance unchanged.
        long nextYear = inGvs(() -> charges.findByStudentIdOrderByDueOnAscIdAsc(AARAV).stream()
                .filter(c -> nextId.equals(c.getAcademicYearId())).mapToLong(FeeCharge::getAmount).sum());
        assertEquals(45000, nextYear);
        JsonNode ticketAfter = api.getJson("/api/parent/hall-tickets", rajeshAarav).get(0);
        assertEquals(ticketBefore.get("feeClearance").asText(), ticketAfter.get("feeClearance").asText());
        assertEquals(ticketBefore.get("pendingReasons").toString(), ticketAfter.get("pendingReasons").toString(),
                "next year's charges never count against this year's exam");
        JsonNode summary = api.getJson("/api/parent/fees/summary", rajeshAarav);
        assertEquals(thisYearOutstanding + 45000, summary.get("totalOutstanding").asLong());
        Set<String> yearsShown = new HashSet<>();
        for (JsonNode ins : summary.get("instalments")) yearsShown.add(ins.get("academicYear").asText());
        assertTrue(yearsShown.contains(nextName), "each instalment is labelled with its year: " + yearsShown);
        assertTrue(yearsShown.size() >= 2);
    }

    @Test
    @Order(7)
    void startingTheYearMovesStudentsAndKeepsHistory() throws Exception {
        aadhyaPayments = inGvs(() -> (long) payments.findByStudentIdOrderByPaidAtDesc(AADHYA).size());
        aadhyaAttendance = inGvs(() -> attendanceDays.findAll().stream().filter(d -> AADHYA.equals(d.getStudentId())).count());

        String admin = admin();
        assertEquals(403, api.post(ROSTER + "/" + nextId + "/start", Map.of(), office()).get("_status").asInt());
        JsonNode started = api.post(ROSTER + "/" + nextId + "/start", Map.of(), admin);
        assertEquals(200, started.get("_status").asInt(), started.toString());
        assertTrue(started.get("started").asBoolean());
        assertEquals(1, started.get("exited").asInt());
        assertEquals(2, started.get("joined").asInt());
        // Safe to repeat.
        assertTrue(api.post(ROSTER + "/" + nextId + "/start", Map.of(), admin).get("alreadyCurrent").asBoolean());
        assertEquals("CURRENT", api.getJson(ROSTER, admin).get("current").get("status").asText());
        assertEquals(nextId, api.getJson(ROSTER, admin).get("current").get("id").asText());

        // Returning students: next-year class, section and roll.
        Student aarav = inGvs(() -> students.findById(AARAV).orElseThrow());
        assertEquals("GVS-11-A", aarav.getClassId());
        assertEquals("A", aarav.getSection());
        assertEquals("18", aarav.getRoll());
        assertEquals("GVS-9-A", inGvs(() -> students.findById(KAVYA).orElseThrow().getClassId()), "repeating stays in grade 9");
        assertEquals("Active", inGvs(() -> students.findByAdmissionNumber("GVS-ADM-NX-902").orElseThrow().getStatus()));

        // Last year's assignments are unchanged history.
        StudentEnrollment last = inGvs(() -> enrollments.findByStudentIdAndAcademicYearId(AARAV, currentId).orElseThrow());
        assertEquals("GVS-10-A", last.getClassId());
        assertEquals("18", last.getRoll());
        assertEquals("PROMOTED", last.getOutcome());

        // The leaver: inactive, with date and reason, nothing deleted, not in any active roster.
        Student aadhya = inGvs(() -> students.findById(AADHYA).orElseThrow());
        assertEquals("Exited", aadhya.getStatus());
        assertEquals("Transferred to another school", aadhya.getExitReason());
        assertNotNull(aadhya.getExitDate());
        StudentEnrollment left = inGvs(() -> enrollments.findByStudentIdAndAcademicYearId(AADHYA, currentId).orElseThrow());
        assertEquals("EXITED", left.getOutcome());
        assertTrue(inGvs(() -> enrollments.findByStudentIdAndAcademicYearId(AADHYA, nextId).isEmpty()));
        assertEquals(aadhyaPayments, inGvs(() -> (long) payments.findByStudentIdOrderByPaidAtDesc(AADHYA).size()), "fee records kept");
        assertEquals(aadhyaAttendance, inGvs(() -> attendanceDays.findAll().stream().filter(d -> AADHYA.equals(d.getStudentId())).count()), "attendance kept");
        for (String cls : List.of("GVS-10-A", "GVS-11-A", "GVS-9-A")) {
            assertTrue(inGvs(() -> students.findByClassIdAndStatusOrderByRollAsc(cls, "Active")).stream().noneMatch(s -> s.getId().equals(AADHYA)));
        }
        // Every fee row now belongs to a year: last year's stay last year's.
        assertTrue(inGvs(() -> charges.findAll().stream().allMatch(c -> c.getAcademicYearId() != null)));
        assertTrue(inGvs(() -> charges.findByStudentIdOrderByDueOnAscIdAsc(KAVYA).stream().anyMatch(c -> currentId.equals(c.getAcademicYearId()))));
    }

    @Test
    @Order(8)
    void pastYearsAreReadOnlyAndOtherSchoolsCannotSeeThisPlan() throws Exception {
        String admin = admin();
        JsonNode past = api.post(ROSTER + "/" + currentId + "/apply", Map.of("decisions", List.of(),
                "newStudents", List.of(newStudent("GVS-ADM-NX-950", "Late Joiner", "GVS-9-A", "30", "Parent Name", "9123400099", null))), admin);
        assertEquals("PAST_YEAR", past.get("code").asText(), past.toString());
        assertEquals("PAST_YEAR", put(ROSTER + "/" + currentId + "/fee-schedule",
                Map.of("instalments", List.of(Map.of("number", 1, "label", "Term 1", "dueOn", nextStart.minusMonths(2).toString()))), admin).get("code").asText());

        // St. Jude's leadership: GVS's years are not found, and its own draft has no GVS student.
        String sjm = api.staff("principal@stjudemodel.edu.in", "StJude@2026", "SJM");
        assertEquals("NOT_FOUND", api.getJson(ROSTER + "/" + nextId + "/draft", sjm).get("code").asText());
        JsonNode sjmYears = api.getJson(ROSTER, sjm);
        for (JsonNode y : sjmYears.get("years")) {
            assertNotEquals(nextId, y.get("id").asText(), "GVS's year is not listed for SJM");
            assertTrue(y.get("id").asText().startsWith("AY-SJM-"), y.toString());
        }
        String sjmCurrent = sjmYears.get("current").get("id").asText();
        JsonNode sjmDraft = api.getJson(ROSTER + "/" + sjmCurrent + "/draft", sjm);
        for (JsonNode a : sjmDraft.get("admitted")) assertFalse(a.get("studentId").asText().startsWith("GVS-"));
        assertEquals(403, api.post(ROSTER, Map.of("name", nextName, "startDate", nextStart.toString(), "endDate", nextEnd.toString()), sjm).get("_status").asInt(),
                "a Principal cannot prepare years");
        // The retired in-place promote endpoint no longer moves anyone.
        assertEquals(410, api.post("/api/admin/students/promote", Map.of("toClassId", "GVS-10-A", "studentIds", List.of(KAVYA)), admin).get("_status").asInt());
    }

    // ------------------------------------------------------------------ helpers

    private static Map<String, Object> newStudent(String adm, String name, String classId, String roll, String guardian, String mobile, Long fee) {
        Map<String, Object> m = new HashMap<>();
        m.put("admissionNumber", adm);
        m.put("name", name);
        m.put("toClassId", classId);
        m.put("roll", roll);
        m.put("guardianName", guardian);
        m.put("guardianMobile", mobile);
        if (fee != null) m.put("annualFee", fee);
        return m;
    }

    private static JsonNode rosterRow(JsonNode draft, String studentId) {
        for (JsonNode r : draft.get("roster")) if (studentId.equals(r.get("studentId").asText())) return r;
        fail(studentId + " not in the roster draft");
        return null;
    }

    /** Children a guardian sees at sign-in (the parent OTP verification lists them). */
    private List<String> childIds(String mobile) throws Exception {
        JsonNode c = api.otp(mobile, "PARENT_LOGIN");
        JsonNode v = api.post("/api/auth/parent/verify", Map.of("challengeId", c.get("challengeId").asText(), "code", c.get("devCode").asText()));
        assertEquals(200, v.get("_status").asInt(), v.toString());
        List<String> ids = new ArrayList<>();
        for (JsonNode ch : v.get("children")) ids.add(ch.get("id").asText());
        return ids;
    }

    private JsonNode put(String url, Object body, String token) throws Exception {
        var r = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(url)
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON).content(json.writeValueAsString(body))
                .header("Authorization", "Bearer " + token)).andReturn();
        String s = r.getResponse().getContentAsString();
        JsonNode n = s.isBlank() ? json.createObjectNode() : json.readTree(s);
        if (n.isObject()) ((com.fasterxml.jackson.databind.node.ObjectNode) n).put("_status", r.getResponse().getStatus());
        return n;
    }
}
