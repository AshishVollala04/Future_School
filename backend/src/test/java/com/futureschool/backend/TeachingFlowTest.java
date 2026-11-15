package com.futureschool.backend;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.futureschool.backend.repository.AuditEventRepository;
import com.futureschool.backend.tenant.TenantContext;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Staff side on the backend, end to end with the parent app:
 * attendance register -> parent attendance; payment -> Class Teacher release -> parent hall ticket;
 * marks -> review -> report cards -> Principal -> Class Teacher publishes -> parent results.
 * Sarah Jenkins (9848012345) = Class Teacher 10-A + Physical Science. Raghavan Nair (9848022222) = Mathematics.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class TeachingFlowTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired AuditEventRepository audit;
    @Autowired TransactionTemplate tx;
    Api api;

    static final String[] TEN_A = {"GVS-2027-0002", "GVS-2027-0003", "GVS-2027-0004", "GVS-2027-0005", "GVS-2027-0006", "GVS-2027-0001"};

    @BeforeEach
    void setUp() {
        api = new Api(mvc, json);
    }

    static String lastSchoolDay() {
        LocalDate d = LocalDate.now(ZoneId.of("Asia/Kolkata"));
        while (d.getDayOfWeek() == DayOfWeek.SUNDAY) d = d.minusDays(1);
        return d.toString();
    }

    private String sarah() throws Exception {
        return api.teacher("9848012345", "GVS");
    }

    private String nair() throws Exception {
        return api.teacher("9848022222", "GVS");
    }

    private String principal() throws Exception {
        return api.staff("principal@greenwoodvalley.edu.in", "Greenwood@2026", "GVS");
    }

    private static String q(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }

    private String stepUp(String token, String purpose) throws Exception {
        JsonNode c = api.post("/api/auth/step-up/request", Map.of("purpose", purpose), token);
        return api.post("/api/auth/step-up/verify", Map.of("challengeId", c.get("challengeId").asText(), "code", c.get("devCode").asText()), token)
                .get("stepUpToken").asText();
    }

    @Test
    @Order(1)
    void assignmentsKeepTheTwoHatsSeparate() throws Exception {
        JsonNode a = api.getJson("/api/staff/assignments", sarah());
        assertEquals("GVS-10-A", a.get("classTeacherOf").get("id").asText());
        assertEquals(7, a.get("classTeacherOf").get("subjectTeachers").size());
        List<String> teaching = new ArrayList<>();
        a.get("teaching").forEach(x -> teaching.add(x.get("classSection").get("id").asText() + ":" + x.get("subject").asText()));
        assertTrue(teaching.containsAll(List.of("GVS-10-A:Physical Science", "GVS-10-B:Physical Science", "GVS-9-A:Physical Science")), teaching.toString());
        // SJM's own teacher sees only SJM classes, never GVS ones.
        JsonNode sjm = api.getJson("/api/staff/assignments", api.teacher("9848033333", "SJM"));
        assertTrue(sjm.get("classTeacherOf").isNull() || sjm.get("classTeacherOf").get("id").asText().startsWith("SJM-"), sjm.toString());
        sjm.get("teaching").forEach(x -> assertTrue(x.get("classSection").get("id").asText().startsWith("SJM-"), sjm.toString()));
        assertEquals(403, api.status("/api/staff/assignments", api.parent("9876543210", "GVS-2027-0001")));
    }

    @Test
    @Order(2)
    void registerIsClassTeacherOnlyAndCorrectionsNeedAReason() throws Exception {
        String day = lastSchoolDay();
        String url = "/api/staff/attendance/register?classId=GVS-10-A&date=" + day + "&session=MORNING";
        assertEquals(403, api.status(url, nair()));
        String s = sarah();
        JsonNode empty = api.getJson(url, s);
        assertEquals(6, empty.get("rows").size());
        assertTrue(empty.get("saved").isNull());

        Map<String, String> marks = new LinkedHashMap<>();
        for (String id : TEN_A) marks.put(id, "P");
        marks.remove("GVS-2027-0006");
        Map<String, Object> body = new HashMap<>(Map.of("classSectionId", "GVS-10-A", "date", day, "session", "MORNING", "marks", marks));
        assertEquals("INCOMPLETE", api.post("/api/staff/attendance/register", body, s).get("code").asText());
        marks.put("GVS-2027-0006", "LATE");
        marks.put("GVS-2027-0001", "A");
        assertEquals(200, api.post("/api/staff/attendance/register", body, s).get("_status").asInt());

        marks.put("GVS-2027-0001", "P");
        assertEquals("REASON_REQUIRED", api.post("/api/staff/attendance/register", body, s).get("code").asText());
        body.put("correctionReason", "Aarav arrived after roll call; marked absent by mistake.");
        JsonNode corrected = api.post("/api/staff/attendance/register", body, s);
        assertEquals(1, corrected.get("saved").get("history").size());
        assertEquals("GVS-2027-0001", corrected.get("saved").get("history").get(0).get("changes").get(0).get("studentId").asText());

        Map<String, Object> future = new HashMap<>(body);
        future.put("date", LocalDate.now(ZoneId.of("Asia/Kolkata")).plusDays(2).toString());
        assertEquals("FUTURE", api.post("/api/staff/attendance/register", future, s).get("code").asText());

        // The parent sees the corrected mark for that day.
        JsonNode att = api.getJson("/api/parent/attendance?days=10", api.parent("9876543210", "GVS-2027-0001"));
        JsonNode dayRow = null;
        for (JsonNode d : att.get("days")) if (d.get("date").asText().equals(day)) dayRow = d;
        assertNotNull(dayRow, "parent should see the register day");
        assertEquals("P", dayRow.get("morning").asText());
        TenantContext.runAs("GVS", () -> tx.executeWithoutResult(t -> assertFalse(audit.findByActionOrderByAtDesc("ATTENDANCE_CORRECTED").isEmpty())));
    }

    @Test
    @Order(3)
    void hallTicketReleaseNeedsFeesAndTheClassTeacher() throws Exception {
        String s = sarah();
        JsonNode list = api.getJson("/api/staff/hall-tickets?classId=GVS-10-A", s);
        assertEquals(6, list.size());
        assertEquals("FEE_PENDING", api.post("/api/staff/hall-tickets/release", Map.of("examId", "EX-GVS-SA1", "studentId", "GVS-2027-0001"), s).get("code").asText());
        assertEquals(200, api.post("/api/staff/hall-tickets/release", Map.of("examId", "EX-GVS-SA1", "studentId", "GVS-2027-0002"), s).get("_status").asInt());
        assertEquals("ALREADY_RELEASED", api.post("/api/staff/hall-tickets/release", Map.of("examId", "EX-GVS-SA1", "studentId", "GVS-2027-0002"), s).get("code").asText());
        assertEquals(403, api.post("/api/staff/hall-tickets/release", Map.of("examId", "EX-GVS-SA1", "studentId", "GVS-2027-0005"), nair()).get("_status").asInt());

        // Flow 3 on the backend: parent pays -> fees cleared but NOT released -> Class Teacher releases -> available.
        String parent = api.parent("9876543210", "GVS-2027-0001");
        JsonNode order = api.post("/api/parent/fees/orders", Map.of("instalments", List.of(2)), parent);
        api.post("/api/parent/fees/orders/" + order.get("orderId").asText() + "/confirm-mock", Map.of("method", "UPI", "stepUpToken", stepUp(parent, "PAYMENT")), parent);
        JsonNode before = api.getJson("/api/parent/hall-tickets", parent).get(0);
        assertEquals("CLEARED", before.get("feeClearance").asText());
        assertFalse(before.get("available").asBoolean());
        assertEquals(200, api.post("/api/staff/hall-tickets/release", Map.of("examId", "EX-GVS-SA1", "studentId", "GVS-2027-0001"), s).get("_status").asInt());
        JsonNode after = api.getJson("/api/parent/hall-tickets", parent).get(0);
        assertTrue(after.get("available").asBoolean());
        assertEquals("SA-1-10A-18", after.get("hallTicketNo").asText());
    }

    @Test
    @Order(4)
    void principalOverrideNeedsReasonOtpAndClearedFees() throws Exception {
        String p = principal();
        Map<String, Object> harini = new HashMap<>(Map.of("examId", "EX-GVS-SA1", "studentId", "GVS-2027-0005", "reason", "Class Teacher on emergency leave today."));
        assertEquals("STEP_UP_REQUIRED", api.post("/api/staff/hall-tickets/override", harini, p).get("code").asText());
        Map<String, Object> shortReason = new HashMap<>(harini);
        shortReason.put("reason", "urgent");
        shortReason.put("stepUpToken", stepUp(p, "SENSITIVE_STAFF_ACTION"));
        assertEquals("REASON_REQUIRED", api.post("/api/staff/hall-tickets/override", shortReason, p).get("code").asText());
        Map<String, Object> devansh = new HashMap<>(harini);
        devansh.put("studentId", "GVS-2027-0004");
        devansh.put("stepUpToken", stepUp(p, "SENSITIVE_STAFF_ACTION"));
        assertEquals("FEE_PENDING", api.post("/api/staff/hall-tickets/override", devansh, p).get("code").asText());
        harini.put("stepUpToken", stepUp(p, "SENSITIVE_STAFF_ACTION"));
        JsonNode ok = api.post("/api/staff/hall-tickets/override", harini, p);
        assertEquals(200, ok.get("_status").asInt(), ok.toString());
        assertEquals("Class Teacher on emergency leave today.", ok.get("release").get("principalOverride").get("reason").asText());
        assertEquals(403, api.post("/api/staff/hall-tickets/release", Map.of("examId", "EX-GVS-SA1", "studentId", "GVS-2027-0006"), p).get("_status").asInt());
    }

    private JsonNode sheet(String token, String subject) throws Exception {
        // MockMvc encodes the URL template itself, so pass the raw id.
        return api.getJson("/api/staff/marks/sheet?id=AS-GVS-FA2:GVS-10-A:" + subject, token);
    }

    private Map<String, Object> rows(JsonNode students, Object valueOrNull, String abFor) {
        Map<String, Object> rows = new LinkedHashMap<>();
        for (JsonNode st : students) {
            Map<String, Object> r = new HashMap<>();
            String id = st.get("id").asText();
            r.put("internal", id.equals(abFor) ? "AB" : valueOrNull);
            r.put("external", null);
            rows.put(id, r);
        }
        return rows;
    }

    @Test
    @Order(5)
    void marksToPublicationEndToEnd() throws Exception {
        String n = nair(), s = sarah(), p = principal();
        String parent = api.parent("9876543210", "GVS-2027-0001");
        int resultsBefore = api.getJson("/api/parent/results", parent).size();

        // --- Subject Teacher (Nair, Mathematics)
        JsonNode my = api.getJson("/api/staff/marks/my-sheets", n);
        assertTrue(my.toString().contains("AS-GVS-FA2:GVS-10-A:Mathematics"));
        JsonNode maths = sheet(n, "Mathematics");
        assertTrue(maths.get("canEdit").asBoolean());
        JsonNode asCt = sheet(s, "Mathematics");
        assertNotNull(asCt.get("canEdit"), asCt.toString());
        assertFalse(asCt.get("canEdit").asBoolean(), "the Class Teacher cannot edit another teacher's subject");
        String mathsId = "AS-GVS-FA2:GVS-10-A:Mathematics";
        assertEquals("INVALID", api.post("/api/staff/marks/sheet", Map.of("id", mathsId, "rows", rows(maths.get("students"), 25, null), "submit", false), n).get("code").asText());
        assertEquals("INCOMPLETE", api.post("/api/staff/marks/sheet", Map.of("id", mathsId, "rows", rows(maths.get("students"), null, null), "submit", true), n).get("code").asText());
        assertEquals("SUBMITTED", api.post("/api/staff/marks/sheet", Map.of("id", mathsId, "rows", rows(maths.get("students"), 17, "GVS-2027-0006"), "submit", true), n)
                .get("sheet").get("status").asText());
        assertEquals("LOCKED", api.post("/api/staff/marks/sheet", Map.of("id", mathsId, "rows", rows(maths.get("students"), 18, null), "submit", true), n).get("code").asText());

        // --- Sarah enters her own subject
        String psId = "AS-GVS-FA2:GVS-10-A:Physical Science";
        JsonNode ps = sheet(s, "Physical Science");
        assertEquals(200, api.post("/api/staff/marks/sheet", Map.of("id", psId, "rows", rows(ps.get("students"), 15, null), "submit", true), s).get("_status").asInt());

        // --- Class Teacher review
        assertEquals("NOT_READY", api.post("/api/staff/report-cards/generate", Map.of("assessmentId", "AS-GVS-FA2", "classId", "GVS-10-A"), s).get("code").asText());
        assertEquals("REASON", api.post("/api/staff/marks/review", Map.of("id", mathsId, "action", "RETURN", "reason", "no"), s).get("code").asText());
        assertEquals("RETURNED", api.post("/api/staff/marks/review", Map.of("id", mathsId, "action", "RETURN", "reason", "Check roll 14: absent or not?"), s)
                .get("sheet").get("status").asText());
        JsonNode resub = api.post("/api/staff/marks/sheet", Map.of("id", mathsId, "rows", rows(maths.get("students"), 17, null), "submit", true), n);
        assertEquals("SUBMITTED", resub.get("sheet").get("status").asText());
        // The Subject Teacher cannot accept their own sheet.
        assertEquals("STATE", api.post("/api/staff/marks/review", Map.of("id", mathsId, "action", "ACCEPT"), n).get("code").asText());
        for (JsonNode sh : api.getJson("/api/staff/marks/class-sheets?assessmentId=AS-GVS-FA2&classId=GVS-10-A", s)) {
            if ("SUBMITTED".equals(sh.get("sheet").get("status").asText())) {
                api.post("/api/staff/marks/review", Map.of("id", sh.get("sheet").get("id").asText(), "action", "ACCEPT"), s);
            }
        }

        // --- Report cards
        JsonNode cards = api.post("/api/staff/report-cards/generate", Map.of("assessmentId", "AS-GVS-FA2", "classId", "GVS-10-A"), s);
        assertEquals(6, cards.size(), cards.toString());
        JsonNode devansh = null;
        for (JsonNode c : cards) if (c.get("studentId").asText().equals("GVS-2027-0004")) devansh = c;
        for (JsonNode sub : devansh.get("subjects")) if (sub.get("subject").asText().equals("Biology")) assertEquals("AB", sub.get("internal").asText());
        for (JsonNode sub : devansh.get("subjects")) {
            if (sub.get("subject").asText().equals("Hindi")) assertEquals(4, sub.get("passMark").asInt()); // 20% of 20 (second language)
            if (sub.get("subject").asText().equals("English")) assertEquals(7, sub.get("passMark").asInt()); // 35% of 20
        }
        Map<String, String> classBody = Map.of("assessmentId", "AS-GVS-FA2", "classId", "GVS-10-A");
        assertEquals("REMARKS", api.post("/api/staff/report-cards/submit", classBody, s).get("code").asText());
        for (JsonNode c : cards) api.post("/api/staff/report-cards/remark", Map.of("id", c.get("id").asText(), "remark", "Steady progress this term."), s);
        JsonNode submitted = api.post("/api/staff/report-cards/submit", classBody, s);
        assertTrue(submitted.isArray() && submitted.size() == 6, submitted.toString());
        assertEquals(resultsBefore, api.getJson("/api/parent/results", parent).size(), "parents see nothing before publication");
        assertEquals("NOT_READY", api.post("/api/staff/results/publish", classBody, s).get("code").asText());

        // --- Principal approves / returns each card; cannot publish
        JsonNode groups = api.getJson("/api/staff/report-cards/principal", p);
        assertEquals(6, groups.get(0).get("cards").size());
        String aaravCard = "AS-GVS-FA2:GVS-2027-0001";
        assertEquals("RETURNED", api.post("/api/staff/report-cards/decision", Map.of("id", aaravCard, "decision", "RETURN", "note", "Please personalise the remark."), p)
                .get("status").asText());
        for (JsonNode c : cards) {
            if (!c.get("id").asText().equals(aaravCard)) api.post("/api/staff/report-cards/decision", Map.of("id", c.get("id").asText(), "decision", "APPROVE"), p);
        }
        assertEquals(403, api.post("/api/staff/results/publish", classBody, p).get("_status").asInt(), "the Principal never publishes");
        assertEquals(403, api.post("/api/staff/report-cards/decision", Map.of("id", aaravCard, "decision", "APPROVE"), s).get("_status").asInt());
        assertEquals("NOT_READY", api.post("/api/staff/results/publish", classBody, s).get("code").asText());

        api.post("/api/staff/report-cards/remark", Map.of("id", aaravCard, "remark", "Aarav is consistent; more practice in numericals."), s);
        api.post("/api/staff/report-cards/submit", classBody, s);
        api.post("/api/staff/report-cards/decision", Map.of("id", aaravCard, "decision", "APPROVE"), p);

        // --- Class Teacher publishes
        JsonNode pub = api.post("/api/staff/results/publish", classBody, s);
        assertEquals(6, pub.get("published").asInt(), pub.toString());
        JsonNode res = api.getJson("/api/parent/results", parent);
        assertEquals(resultsBefore + 1, res.size());
        JsonNode fa2 = null;
        for (JsonNode r : res) {
            if (r.get("examName").asText().equals("FA-2") && "CURRENT".equals(r.get("status").asText())) {
                fa2 = r;
                break;
            }
        }
        assertNotNull(fa2);
        assertEquals("CURRENT", fa2.get("status").asText());
        assertTrue(fa2.get("version").asInt() >= 1);
        assertEquals("Aarav is consistent; more practice in numericals.", fa2.get("classTeacherRemark").asText());
        TenantContext.runAs("GVS", () -> tx.executeWithoutResult(t -> assertEquals(1, audit.findByActionOrderByAtDesc("RESULTS_PUBLISHED").size())));
    }
}
