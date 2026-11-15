package com.futureschool.backend.teaching;

import com.futureschool.backend.auth.SignInService;
import com.futureschool.backend.entity.*;
import com.futureschool.backend.parent.ParentDataService;
import com.futureschool.backend.parent.ParentViews.HallTicket;
import com.futureschool.backend.repository.ExamWindowRepository;
import com.futureschool.backend.repository.HallTicketReleaseRepository;
import com.futureschool.backend.security.SchoolPrincipal;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;
import java.util.List;

/**
 * Hall tickets, staff side.
 *  - Class Teacher (own class) releases ONLY fee-cleared students. Principal/Admin may view any class.
 *  - Principal emergency override: fee-cleared student, reason (10+ chars), fresh step-up OTP, audited.
 *  - Payment never releases; release never changes fees.
 */
@Service
public class StaffHallTicketService {

    private final Teaching t;
    private final ParentDataService fees;
    private final ExamWindowRepository exams;
    private final HallTicketReleaseRepository releases;
    private final SignInService signIn;

    public StaffHallTicketService(Teaching t, ParentDataService fees, ExamWindowRepository exams, HallTicketReleaseRepository releases, SignInService signIn) {
        this.t = t;
        this.fees = fees;
        this.exams = exams;
        this.releases = releases;
        this.signIn = signIn;
    }

    private static List<Integer> grades(ExamWindow e) {
        return Arrays.stream(e.getGradesCsv().split(",")).map(String::trim).map(Integer::parseInt).toList();
    }

    private SchoolClass access(SchoolPrincipal p, String classId) {
        SchoolClass c = t.classOrThrow(classId);
        if (Teaching.isLeadership(p) || Teaching.isClassTeacher(p, c)) return c;
        throw Teaching.denied("Only the Class Teacher of this class can do this.");
    }

    @Transactional(readOnly = true)
    public List<HallTicket> listForClass(SchoolPrincipal p, String classId, String examId) {
        SchoolClass c = access(p, classId);
        int grade = c.getGradeNumber() == null ? 0 : c.getGradeNumber();
        String today = ParentDataService.today();
        ExamWindow exam = examId != null && !examId.isBlank()
                ? exams.findById(examId).orElse(null)
                : exams.findByStartsOnGreaterThanEqualOrderByStartsOnAsc(today).stream().filter(e -> grades(e).contains(grade)).findFirst().orElse(null);
        if (exam == null) return List.of();
        return t.roster(c.getId()).stream().map(s -> fees.hallTicket(exam, s, grade, today)).toList();
    }

    private Student studentInClassScope(SchoolPrincipal p, String studentId) {
        Student s = t.students.findById(studentId == null ? "" : studentId).orElseThrow(() -> Teaching.denied("Student not found in this school."));
        access(p, s.getClassId());
        return s;
    }

    @Transactional
    public HallTicket release(SchoolPrincipal p, String examId, String studentId) {
        if (p.role() != UserRole.TEACHER) throw Teaching.denied("Only the Class Teacher releases hall tickets.");
        Student s = studentInClassScope(p, studentId);
        ExamWindow e = exams.findById(examId == null ? "" : examId).orElseThrow(() -> Teaching.rule("NOT_FOUND", "Exam not found."));
        int grade = t.classOrThrow(s.getClassId()).getGradeNumber();
        HallTicket h = fees.hallTicket(e, s, grade, ParentDataService.today());
        if (h.release() != null) throw Teaching.rule("ALREADY_RELEASED", "Already released.");
        if (!"CLEARED".equals(h.feeClearance())) throw Teaching.rule("FEE_PENDING", "Fee clearance is pending: " + String.join("; ", h.pendingReasons()));
        releases.save(HallTicketRelease.builder().id("REL-" + e.getId() + "-" + s.getId()).examId(e.getId()).studentId(s.getId())
                .releasedBy(p.account().getId()).releasedAt(Teaching.now()).build());
        t.record(p, "HALL_TICKET_RELEASED", s.getId(), e.getName() + " hall ticket released by Class Teacher.", null);
        return fees.hallTicket(e, s, grade, ParentDataService.today());
    }

    @Transactional(noRollbackFor = com.futureschool.backend.auth.AuthFlowException.class)
    public HallTicket principalOverride(SchoolPrincipal p, String examId, String studentId, String reason, String stepUpToken) {
        if (p.role() != UserRole.PRINCIPAL) throw Teaching.denied("Only the Principal can use the emergency override.");
        Student s = studentInClassScope(p, studentId);
        ExamWindow e = exams.findById(examId == null ? "" : examId).orElseThrow(() -> Teaching.rule("NOT_FOUND", "Exam not found."));
        int grade = t.classOrThrow(s.getClassId()).getGradeNumber();
        HallTicket h = fees.hallTicket(e, s, grade, ParentDataService.today());
        if (h.release() != null) throw Teaching.rule("ALREADY_RELEASED", "Already released.");
        if (!"CLEARED".equals(h.feeClearance())) throw Teaching.rule("FEE_PENDING", "Override is allowed only for a fee-cleared student.");
        String r = reason == null ? "" : reason.trim();
        if (r.length() < 10) throw Teaching.rule("REASON_REQUIRED", "Give a reason of at least 10 characters.");
        if (!signIn.consumeStepUp(stepUpToken, "SENSITIVE_STAFF_ACTION", p.session())) {
            throw new com.futureschool.backend.auth.AuthFlowException("STEP_UP_REQUIRED", "Please confirm with the OTP again.", null, 401);
        }
        String at = Teaching.now();
        releases.save(HallTicketRelease.builder().id("REL-" + e.getId() + "-" + s.getId()).examId(e.getId()).studentId(s.getId())
                .releasedBy(p.account().getId()).releasedAt(at).overrideReason(r).overrideBy(p.account().getId()).overrideAt(at).build());
        t.record(p, "HALL_TICKET_PRINCIPAL_OVERRIDE", s.getId(), e.getName() + " hall ticket released by Principal emergency override.", r);
        return fees.hallTicket(e, s, grade, ParentDataService.today());
    }
}
