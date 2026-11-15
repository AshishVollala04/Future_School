package com.futureschool.backend.init;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.futureschool.backend.entity.*;
import com.futureschool.backend.parent.ParentDataService;
import com.futureschool.backend.repository.*;
import com.futureschool.backend.tenant.TenantContext;
import org.springframework.stereotype.Component;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.*;

/**
 * Development seed for the parent app: same figures as the frontend prototype
 * (Frontend/src/mock/db/seed.ts) so both modes show the same child data.
 * Must be called inside TenantContext.runAs(school) and a transaction. Idempotent.
 */
@Component
public class ParentDataSeed {

    record Kid(String id, int grade, String route, long annualFee, Long transport, Long examFee, long activity) {
    }

    private static final List<FeeInstalment> INSTALMENTS = List.of(
            FeeInstalment.builder().number(1).label("Term 1").dueOn("2026-06-15").build(),
            FeeInstalment.builder().number(2).label("Term 2").dueOn("2026-11-15").build(),
            FeeInstalment.builder().number(3).label("Term 3").dueOn("2027-01-10").build(),
            FeeInstalment.builder().number(4).label("Term 4").dueOn("2027-02-10").build());

    private final SchoolRepository schools;
    private final FeeInstalmentRepository instalments;
    private final FeeChargeRepository charges;
    private final FeeConcessionRepository concessions;
    private final FeePaymentRepository payments;
    private final ExamWindowRepository exams;
    private final HallTicketReleaseRepository releases;
    private final PublishedResultRepository results;
    private final StudentAttendanceDayRepository attendance;
    private final StudentRepository students;
    private final ObjectMapper json;

    public ParentDataSeed(SchoolRepository schools, FeeInstalmentRepository instalments, FeeChargeRepository charges, FeeConcessionRepository concessions,
                          FeePaymentRepository payments, ExamWindowRepository exams, HallTicketReleaseRepository releases,
                          PublishedResultRepository results, StudentAttendanceDayRepository attendance, StudentRepository students, ObjectMapper json) {
        this.schools = schools;
        this.instalments = instalments;
        this.charges = charges;
        this.concessions = concessions;
        this.payments = payments;
        this.exams = exams;
        this.releases = releases;
        this.results = results;
        this.attendance = attendance;
        this.students = students;
        this.json = json;
    }

    public void seedGvs() {
        seedGvsExtraResults();
        if (instalments.count() > 0) return;
        String sid = TenantContext.require();
        policy(sid, "Late fee as per school policy, set by the school Admin. None is applied automatically in this prototype.");
        INSTALMENTS.forEach(i -> instalments.save(copy(i, sid)));
        List<Kid> kids = List.of(
                new Kid("GVS-2027-0001", 10, "Route 4", 48000, 1500L, 1500L, 2000),
                new Kid("GVS-2031-0042", 6, "Route 4", 36000, 1200L, null, 1500),
                new Kid("GVS-2028-0117", 9, null, 44000, null, null, 2000),
                // Rest of Class 10-A (staff side demo)
                new Kid("GVS-2027-0002", 10, null, 48000, null, 1500L, 2000),
                new Kid("GVS-2027-0003", 10, "Route 2", 48000, 1500L, 1500L, 2000),
                new Kid("GVS-2027-0004", 10, null, 48000, null, 1500L, 2000),
                new Kid("GVS-2027-0005", 10, null, 48000, null, 1500L, 2000),
                new Kid("GVS-2027-0006", 10, "Route 4", 48000, 1500L, 1500L, 2000));
        kids.forEach(this::charges);
        for (int n = 1; n <= 4; n++) {
            concessions.save(FeeConcession.builder().id("CON-GVS-ANANYA-" + n).chargeId("GVS-2031-0042-SF-" + n).kind("SIBLING").amount(900L).approvedOn("2026-06-02").build());
        }
        int r = 1000;
        pay(sid, ++r, "GVS-2027-0001", "2026-06-12T10:15:00+05:30", "UPI", "GRD-0001", full("GVS-2027-0001", "SF-1", "TR-1", "AC-1"));
        pay(sid, ++r, "GVS-2027-0001", "2026-10-28T19:40:00+05:30", "UPI", "GRD-0001", List.of(a("GVS-2027-0001-SF-2", 6000), a("GVS-2027-0001-TR-2", 1500)));
        pay(sid, ++r, "GVS-2031-0042", "2026-06-12T10:18:00+05:30", "UPI", "GRD-0001", full("GVS-2031-0042", "SF-1", "TR-1", "AC-1"));
        pay(sid, ++r, "GVS-2031-0042", "2026-10-28T19:42:00+05:30", "UPI", "GRD-0001", full("GVS-2031-0042", "SF-2", "TR-2"));
        pay(sid, ++r, "GVS-2028-0117", "2026-07-03T11:00:00+05:30", "CASH_AT_OFFICE", null, List.of(a("GVS-2028-0117-SF-1", 8000), a("GVS-2028-0117-AC-1", 2000)));
        pay(sid, ++r, "GVS-2027-0002", "2026-06-10T09:00:00+05:30", "NETBANKING", null, full("GVS-2027-0002", "SF-1", "AC-1", "SF-2"));
        pay(sid, ++r, "GVS-2027-0003", "2026-06-10T09:30:00+05:30", "UPI", null, full("GVS-2027-0003", "SF-1", "TR-1", "AC-1", "SF-2", "TR-2"));
        pay(sid, ++r, "GVS-2027-0005", "2026-06-11T12:00:00+05:30", "UPI", null, full("GVS-2027-0005", "SF-1", "AC-1", "SF-2"));
        pay(sid, ++r, "GVS-2027-0006", "2026-06-11T12:30:00+05:30", "CARD", null, full("GVS-2027-0006", "SF-1", "TR-1", "AC-1"));

        exams.save(ExamWindow.builder().id("EX-GVS-SA1").name("SA-1").startsOn("2026-11-23").gradesCsv("1,2,3,4,5,6,7,8,9,10")
                .clearanceCategoriesCsv("SCHOOL_FEE,TRANSPORT_FEE").clearanceUptoInstalment(2).build());
        String yesterday = LocalDate.now(ParentDataService.SCHOOL_ZONE).minusDays(1).toString();
        releases.save(HallTicketRelease.builder().id("REL-GVS-SA1-GVS-2031-0042").examId("EX-GVS-SA1").studentId("GVS-2031-0042")
                .releasedBy("STF-T-0008").releasedAt(yesterday + "T12:00:00+05:30").build());
        releases.save(HallTicketRelease.builder().id("REL-GVS-SA1-GVS-2027-0003").examId("EX-GVS-SA1").studentId("GVS-2027-0003")
                .releasedBy("STF-T-0001").releasedAt(yesterday + "T12:05:00+05:30").build());

        results.save(fa1(15, 1, "SUPERSEDED", "2026-08-20"));
        results.save(fa1(18, 2, "CURRENT", "2026-08-27"));
        kids.forEach(k -> attendanceHistory(k.id()));
    }

    public void seedSjm() {
        seedSjmExtraResults();
        if (instalments.count() > 0) return;
        String sid = TenantContext.require();
        policy(sid, "Late fee as per school policy, set by the school Admin.");
        INSTALMENTS.forEach(i -> instalments.save(copy(i, sid)));
        charges(new Kid("SJM-2033-0105", 4, null, 30000, null, null, 1000));
        int r = 1000;
        pay(sid, ++r, "SJM-2033-0105", "2026-06-14T18:00:00+05:30", "UPI", "GRD-0001", full("SJM-2033-0105", "SF-1", "AC-1"));
        pay(sid, ++r, "SJM-2033-0105", "2026-10-20T18:00:00+05:30", "UPI", "GRD-0001", full("SJM-2033-0105", "SF-2"));
        exams.save(ExamWindow.builder().id("EX-SJM-SA1").name("Half-Yearly").startsOn("2026-11-25").gradesCsv("1,2,3,4,5,6,7,8,9,10")
                .clearanceCategoriesCsv("SCHOOL_FEE").clearanceUptoInstalment(2).build());
        String twoDaysAgo = LocalDate.now(ParentDataService.SCHOOL_ZONE).minusDays(2).toString();
        releases.save(HallTicketRelease.builder().id("REL-SJM-SA1-SJM-2033-0105").examId("EX-SJM-SA1").studentId("SJM-2033-0105")
                .releasedBy("STF-T-0101").releasedAt(twoDaysAgo + "T11:00:00+05:30").build());
        attendanceHistory("SJM-2033-0105");
    }

    // ------------------------------------------------------------------ helpers

    private void policy(String schoolId, String text) {
        schools.findById(schoolId).ifPresent(s -> {
            s.setLateFeePolicy(text);
            schools.save(s);
        });
    }

    private FeeInstalment copy(FeeInstalment i, String sid) {
        return FeeInstalment.builder().id(sid + "-INS-" + i.getNumber()).number(i.getNumber()).label(i.getLabel()).dueOn(i.getDueOn()).build();
    }

    private void charges(Kid k) {
        long per = Math.round(k.annualFee() / 4.0);
        for (FeeInstalment i : INSTALMENTS) {
            charge(k.id() + "-SF-" + i.getNumber(), k.id(), "SCHOOL_FEE", i.getNumber(), "School fee", per, i.getDueOn());
            if (k.transport() != null) charge(k.id() + "-TR-" + i.getNumber(), k.id(), "TRANSPORT_FEE", i.getNumber(), "Transport (" + k.route() + ")", k.transport(), i.getDueOn());
        }
        charge(k.id() + "-AC-1", k.id(), "ACTIVITY_FEE", 1, "Activity fee", k.activity(), INSTALMENTS.get(0).getDueOn());
        if (k.examFee() != null) charge(k.id() + "-EX-4", k.id(), "EXAM_FEE", 4, "SSC board exam fee", k.examFee(), INSTALMENTS.get(3).getDueOn());
    }

    private void charge(String id, String studentId, String category, int instalment, String label, long amount, String dueOn) {
        charges.save(FeeCharge.builder().id(id).studentId(studentId).category(category).instalment(instalment).label(label).amount(amount).dueOn(dueOn).build());
    }

    private static PaymentAllocation a(String chargeId, long amount) {
        return new PaymentAllocation(chargeId, amount);
    }

    /** Full outstanding (amount minus concession) of the given charges. */
    private List<PaymentAllocation> full(String sid, String... suffixes) {
        List<PaymentAllocation> out = new ArrayList<>();
        for (String suf : suffixes) {
            FeeCharge c = charges.findById(sid + "-" + suf).orElseThrow();
            long con = concessions.findByChargeIdIn(List.of(c.getId())).stream().mapToLong(FeeConcession::getAmount).sum();
            out.add(a(c.getId(), c.getAmount() - con));
        }
        return out;
    }

    private void pay(String school, int rcpt, String studentId, String paidAt, String method, String guardian, List<PaymentAllocation> alloc) {
        payments.save(FeePayment.builder().id("PAY-" + school + "-" + rcpt).studentId(studentId)
                .amount(alloc.stream().mapToLong(PaymentAllocation::getAmount).sum()).method(method).providerRef("mock_" + rcpt)
                .paidAt(paidAt).paidByGuardianId(guardian).receiptNo(school + "/2026-27/" + rcpt).mock(true)
                .allocations(new ArrayList<>(alloc)).build());
    }

    private void seedGvsExtraResults() {
        upsertSeed(fa1(15, 1, "SUPERSEDED", "2026-08-20"));
        upsertSeed(fa1(18, 2, "CURRENT", "2026-08-27"));
        upsertSeed(buildResult("RES-GVS-AARAV-FA2-v1", "GVS-2027-0001", "FA-2", 1, "CURRENT", "2026-09-25",
                "Good improvement in Mathematics and Physical Science.",
                new Object[][]{{"Telugu", 18, 0, 20, 0, 7}, {"Hindi", 16, 0, 20, 0, 4}, {"English", 18, 0, 20, 0, 7},
                        {"Mathematics", 19, 0, 20, 0, 7}, {"Physical Science", 10, 0, 10, 0, 4}, {"Biology", 8, 0, 10, 0, 4}, {"Social Studies", 17, 0, 20, 0, 7}}));
        upsertSeed(buildResult("RES-GVS-AARAV-SA1-v1", "GVS-2027-0001", "SA-1", 1, "CURRENT", "2026-10-30",
                "Strong overall Term-1 performance. Keep practising Biology diagrams.",
                new Object[][]{{"Telugu", 18, 69, 20, 80, 35}, {"Hindi", 16, 62, 20, 80, 20}, {"English", 19, 73, 20, 80, 35},
                        {"Mathematics", 19, 76, 20, 80, 35}, {"Physical Science", 9, 35, 10, 40, 18}, {"Biology", 4, 33, 10, 40, 17}, {"Social Studies", 18, 70, 20, 80, 35}}));
        upsertSeed(buildResult("RES-GVS-AARAV-FA3-v1", "GVS-2027-0001", "FA-3", 1, "CURRENT", "2026-12-18",
                "Steady improvement in Physical Science numericals.",
                new Object[][]{{"Telugu", 18, 0, 20, 0, 7}, {"Hindi", 16, 0, 20, 0, 4}, {"English", 19, 0, 20, 0, 7},
                        {"Mathematics", 19, 0, 20, 0, 7}, {"Physical Science", 9, 0, 10, 0, 4}, {"Biology", 8, 0, 10, 0, 4}, {"Social Studies", 18, 0, 20, 0, 7}}));
        upsertSeed(buildResult("RES-GVS-AARAV-FA4-v1", "GVS-2027-0001", "FA-4", 1, "CURRENT", "2027-01-28",
                "Well prepared for board revision tests.",
                new Object[][]{{"Telugu", 19, 0, 20, 0, 7}, {"Hindi", 17, 0, 20, 0, 4}, {"English", 19, 0, 20, 0, 7},
                        {"Mathematics", 20, 0, 20, 0, 7}, {"Physical Science", 9, 0, 10, 0, 4}, {"Biology", 10, 0, 10, 0, 4}, {"Social Studies", 18, 0, 20, 0, 7}}));
        upsertSeed(buildResult("RES-GVS-AARAV-SA2-v1", "GVS-2027-0001", "SA-2", 1, "CURRENT", "2027-02-15",
                "Strong Term-2 performance across all subjects.",
                new Object[][]{{"Telugu", 19, 71, 20, 80, 35}, {"Hindi", 17, 65, 20, 80, 20}, {"English", 19, 75, 20, 80, 35},
                        {"Mathematics", 20, 77, 20, 80, 35}, {"Physical Science", 9, 36, 10, 40, 18}, {"Biology", 9, 35, 10, 40, 17}, {"Social Studies", 18, 72, 20, 80, 35}}));
        upsertSeed(buildResult("RES-GVS-AARAV-PREFINAL-v1", "GVS-2027-0001", "Pre-Final", 1, "CURRENT", "2027-03-05",
                "Excellent Pre-Final readiness across all SSC papers.",
                new Object[][]{{"Telugu", 19, 72, 20, 80, 35}, {"Hindi", 17, 67, 20, 80, 20}, {"English", 19, 75, 20, 80, 35},
                        {"Mathematics", 20, 77, 20, 80, 35}, {"Physical Science", 9, 37, 10, 40, 18}, {"Biology", 9, 36, 10, 40, 17}, {"Social Studies", 19, 73, 20, 80, 35}}));
        upsertSeed(buildResult("RES-GVS-AARAV-FINAL-v1", "GVS-2027-0001", "Final", 1, "CURRENT", "2027-03-22",
                "Outstanding SSC final performance.",
                new Object[][]{{"Telugu", 19, 73, 20, 80, 35}, {"Hindi", 17, 68, 20, 80, 20}, {"English", 19, 76, 20, 80, 35},
                        {"Mathematics", 20, 78, 20, 80, 35}, {"Physical Science", 9, 38, 10, 40, 18}, {"Biology", 9, 37, 10, 40, 17}, {"Social Studies", 19, 74, 20, 80, 35}}));

        saveIfMissing(buildResult("RES-GVS-ANANYA-FA1-v1", "GVS-2031-0042", "FA-1", 1, "CURRENT", "2026-08-27",
                "Active participant in class.",
                new Object[][]{{"Telugu", 17, 0, 20, 0, 7}, {"Hindi", 16, 0, 20, 0, 4}, {"English", 19, 0, 20, 0, 7},
                        {"Mathematics", 18, 0, 20, 0, 7}, {"Science", 17, 0, 20, 0, 7}, {"Social Studies", 18, 0, 20, 0, 7}}));
        saveIfMissing(buildResult("RES-GVS-ANANYA-FA2-v1", "GVS-2031-0042", "FA-2", 1, "CURRENT", "2026-09-25",
                "Very neat presentation in Science.",
                new Object[][]{{"Telugu", 18, 0, 20, 0, 7}, {"Hindi", 17, 0, 20, 0, 4}, {"English", 19, 0, 20, 0, 7},
                        {"Mathematics", 19, 0, 20, 0, 7}, {"Science", 18, 0, 20, 0, 7}, {"Social Studies", 17, 0, 20, 0, 7}}));
        saveIfMissing(buildResult("RES-GVS-ANANYA-SA1-v1", "GVS-2031-0042", "SA-1", 1, "CURRENT", "2026-10-30",
                "Excellent Term-1 performance across all subjects.",
                new Object[][]{{"Telugu", 18, 70, 20, 80, 35}, {"Hindi", 17, 66, 20, 80, 20}, {"English", 19, 75, 20, 80, 35},
                        {"Mathematics", 19, 74, 20, 80, 35}, {"Science", 18, 71, 20, 80, 35}, {"Social Studies", 18, 69, 20, 80, 35}}));
        saveIfMissing(buildResult("RES-GVS-ANANYA-FA3-v1", "GVS-2031-0042", "FA-3", 1, "CURRENT", "2026-12-18",
                "Consistent work in Mathematics and English.",
                new Object[][]{{"Telugu", 18, 0, 20, 0, 7}, {"Hindi", 17, 0, 20, 0, 4}, {"English", 19, 0, 20, 0, 7},
                        {"Mathematics", 19, 0, 20, 0, 7}, {"Science", 19, 0, 20, 0, 7}, {"Social Studies", 18, 0, 20, 0, 7}}));
        saveIfMissing(buildResult("RES-GVS-ANANYA-FA4-v1", "GVS-2031-0042", "FA-4", 1, "CURRENT", "2027-01-28",
                "Very good project work in Social Studies.",
                new Object[][]{{"Telugu", 19, 0, 20, 0, 7}, {"Hindi", 18, 0, 20, 0, 4}, {"English", 19, 0, 20, 0, 7},
                        {"Mathematics", 19, 0, 20, 0, 7}, {"Science", 19, 0, 20, 0, 7}, {"Social Studies", 19, 0, 20, 0, 7}}));
        saveIfMissing(buildResult("RES-GVS-ANANYA-SA2-v1", "GVS-2031-0042", "SA-2", 1, "CURRENT", "2027-03-22",
                "Promoted with A1 grade. Well done!",
                new Object[][]{{"Telugu", 19, 72, 20, 80, 35}, {"Hindi", 18, 69, 20, 80, 20}, {"English", 19, 76, 20, 80, 35},
                        {"Mathematics", 19, 75, 20, 80, 35}, {"Science", 19, 73, 20, 80, 35}, {"Social Studies", 19, 72, 20, 80, 35}}));
    }

    /**
     * St. Jude follows CBSE (Classes 1-5: PT-1, Half-Yearly, PT-2, Annual; 33% to pass).
     * Only exams already held carry results; nothing is published for a future date.
     * Older SSC-style demo rows for St. Jude are removed so the board stays consistent.
     */
    private void seedSjmExtraResults() {
        for (String old : List.of("FA1", "FA2", "SA1", "FA3", "FA4", "SA2")) results.findById("RES-SJM-ROHAN-" + old + "-v1").ifPresent(results::delete);
        exams.findById("EX-SJM-SA1").ifPresent(e -> {
            if (!"Half-Yearly".equals(e.getName())) {
                e.setName("Half-Yearly");
                exams.save(e);
            }
        });
        saveIfMissing(buildResult("RES-SJM-ROHAN-PT1-v1", "SJM-2033-0105", "PT-1", 1, "CURRENT", "2026-08-27",
                "Very cheerful and attentive in class.",
                new Object[][]{{"English", 18, 0, 20, 0, 7}, {"Hindi", 15, 0, 20, 0, 7}, {"Telugu", 16, 0, 20, 0, 7},
                        {"Mathematics", 17, 0, 20, 0, 7}, {"EVS", 18, 0, 20, 0, 7}}));
        saveIfMissing(buildResult("RES-SJM-ROHAN-HY-v1", "SJM-2033-0105", "Half-Yearly", 1, "CURRENT", "2026-10-30",
                "Well done in the half-yearly exam!",
                new Object[][]{{"English", 19, 74, 20, 80, 33}, {"Hindi", 16, 61, 20, 80, 33}, {"Telugu", 17, 65, 20, 80, 33},
                        {"Mathematics", 18, 72, 20, 80, 33}, {"EVS", 19, 73, 20, 80, 33}}));
    }

    private void saveIfMissing(PublishedResult r) {
        if (!results.existsById(r.getId())) results.save(r);
    }

    private void upsertSeed(PublishedResult r) {
        results.findById(r.getId()).ifPresentOrElse(existing -> {
            if (!r.getSubjectsJson().equals(existing.getSubjectsJson())) {
                existing.setSubjectsJson(r.getSubjectsJson());
                results.save(existing);
            }
        }, () -> results.save(r));
    }

    private PublishedResult buildResult(String id, String studentId, String examName, int version, String status,
                                        String publishedOn, String remark, Object[][] rows) {
        List<Map<String, Object>> subjects = new ArrayList<>();
        for (Object[] r : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("subject", r[0]);
            m.put("internal", r[1]);
            m.put("external", r[2]);
            m.put("maxInternal", r[3]);
            m.put("maxExternal", r[4]);
            m.put("passMark", r[5]);
            subjects.add(m);
        }
        try {
            return PublishedResult.builder().id(id).studentId(studentId).examName(examName)
                    .version(version).status(status).publishedOn(publishedOn).subjectsJson(json.writeValueAsString(subjects))
                    .classTeacherRemark(remark).build();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private PublishedResult fa1(int maths, int version, String status, String publishedOn) {
        return buildResult("RES-GVS-AARAV-FA1-v" + version, "GVS-2027-0001", "FA-1", version, status, publishedOn,
                "Consistent effort. Practise numerical problems in Physical Science.",
                new Object[][]{{"Telugu", 17, 0, 20, 0, 7}, {"Hindi", 15, 0, 20, 0, 4}, {"English", 18, 0, 20, 0, 7},
                        {"Mathematics", maths, 0, 20, 0, 7}, {"Physical Science", 8, 0, 10, 0, 4},
                        {"Biology", "AB", 0, 10, 0, 4}, {"Social Studies", 16, 0, 20, 0, 7}});
    }

    /** 90 days of deterministic history (Sundays skipped); today is "not marked yet". */
    private void attendanceHistory(String studentId) {
        if (students.findById(studentId).isEmpty()) return;
        long h = 0;
        for (char ch : studentId.toCharArray()) h = (h * 31 + ch) & 0xFFFFFFFFL;
        LocalDate today = LocalDate.now(ParentDataService.SCHOOL_ZONE);
        for (int i = 90; i >= 0; i--) {
            LocalDate d = today.minusDays(i);
            if (d.getDayOfWeek() == DayOfWeek.SUNDAY) continue;
            String morning, afternoon;
            if (i == 0) {
                morning = "-";
                afternoon = "-";
            } else {
                h = (h * 1103515245L + 12345L) & 0xFFFFFFFFL;
                int r = (int) (h % 100);
                morning = r < 4 ? "A" : r < 6 ? "L" : "P";
                afternoon = !"P".equals(morning) ? morning : r < 8 ? "A" : "P";
            }
            attendance.save(StudentAttendanceDay.builder().id(studentId + "-" + d).studentId(studentId).date(d.toString())
                    .morning(morning).afternoon(afternoon).build());
        }
    }
}
