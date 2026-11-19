package com.futureschool.backend.parent;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/** Response shapes, matching the frontend's types/domain.ts exactly. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class ParentViews {

    private ParentViews() {
    }

    public record Instalment(int number, String label, String dueOn) {
    }

    /** academicYearId: the year the charge belongs to (null only on pre-V13 rows, read as the current year). */
    public record Charge(String id, String schoolId, String studentId, String category, int instalment, String label, long amount, String dueOn,
                         String academicYearId) {
    }

    public record FeeLine(Charge charge, long concession, long paid, long outstanding, boolean overdue) {
    }

    /** One instalment of one academic year (Term 1 of 2026-27 and Term 1 of 2027-28 are separate). */
    public record InstalmentSummary(int number, String label, String dueOn, List<FeeLine> lines, long outstanding, boolean overdue,
                                    String academicYearId, String academicYear) {
    }

    public record NextDue(Instalment instalment, long amount) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record FeeSummary(List<InstalmentSummary> instalments, long totalCharged, long totalConcession, long totalPaid,
                             long totalOutstanding, long overdueAmount, NextDue nextDue, String lateFeeNote) {
    }

    public record Allocation(String chargeId, long amount) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Payment(String id, String schoolId, String studentId, long amount, String method, String providerRef, String paidAt,
                          String paidByGuardianId, String recordedByStaffId, String receiptNo, List<Allocation> allocations, boolean isMock) {
    }

    public record Refund(String id, String paymentId, long amount, String reason, String status, String createdAt) {
    }

    public record Payments(List<Payment> payments, List<Refund> refunds) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Order(String orderId, String studentId, long amount, List<Allocation> allocations, long expiresAt, boolean isMock,
                        String provider, String razorpayKeyId, String razorpayOrderId, long amountPaise, String currency,
                        String prefillName, String prefillContact) {
    }

    public record AttendanceDay(String date, String morning, String afternoon) {
    }

    public record AttendanceSummary(List<AttendanceDay> days, int workingSessions, int presentSessions, double percentage, int absentDays, int leaveDays) {
    }

    public record Subject(String subject, Object internal, Object external, int maxInternal, int maxExternal, int passMark) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Result(String id, String studentId, String examName, int version, String status, String publishedOn,
                         List<Subject> subjects, String classTeacherRemark) {
    }

    public record ClearanceRule(List<String> categories, int uptoInstalment) {
    }

    public record Exam(String id, String schoolId, String name, String startsOn, List<Integer> grades, ClearanceRule clearanceRule) {
    }

    public record Override(String reason, String by, String at) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Release(String examId, String studentId, String releasedBy, String releasedAt, Override principalOverride) {
    }

    public record StudentRef(String id, String name, String rollNumber, int grade, String section) {
    }

    public record ExamSubject(String name, String date, String day, String time, String room) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record HallTicket(Exam exam, StudentRef student, String feeClearance, List<String> pendingReasons, Release release,
                             boolean available, String hallTicketNo, List<ExamSubject> subjects) {
    }
}
