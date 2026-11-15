package com.futureschool.backend.teaching;

import com.futureschool.backend.auth.AuthFlowException;
import com.futureschool.backend.security.AccessPolicy;
import com.futureschool.backend.security.SchoolPrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Function;

/**
 * Staff side (Teacher / Principal / Admin) for attendance, hall tickets and marks.
 * The role is checked by SecurityConfig; the RELATIONSHIP (Class Teacher of this class,
 * Subject Teacher of this subject) is checked in each service.
 */
@RestController
@RequestMapping("/api/staff")
@Tag(name = "Staff: teaching", description = "Attendance register, hall-ticket release, marks to publication")
public class StaffController {

    private final RegisterService registers;
    private final StaffHallTicketService tickets;
    private final MarksWorkflowService marks;

    public StaffController(RegisterService registers, StaffHallTicketService tickets, MarksWorkflowService marks) {
        this.registers = registers;
        this.tickets = tickets;
        this.marks = marks;
    }

    private ResponseEntity<?> run(Authentication auth, Function<SchoolPrincipal, Object> body) {
        try {
            return ResponseEntity.ok(body.apply(AccessPolicy.principal(auth)));
        } catch (AuthFlowException e) {
            Map<String, Object> err = new LinkedHashMap<>();
            err.put("success", false);
            err.put("error", e.getMessage());
            err.put("code", e.getCode());
            return ResponseEntity.status(e.getStatus()).body(err);
        }
    }

    private static String s(Map<String, Object> b, String k) {
        Object v = b == null ? null : b.get(k);
        return v == null ? null : v.toString();
    }

    // ---- structure
    @GetMapping("/assignments")
    @Operation(summary = "My Teaching (subjects) and My Class Teacher Responsibility (class), kept separate")
    public ResponseEntity<?> assignments(Authentication a) {
        return run(a, marks::assignments);
    }

    @GetMapping("/classes")
    public ResponseEntity<?> classes(Authentication a) {
        return run(a, p -> marks.listClasses());
    }

    // ---- attendance (Class Teacher)
    @GetMapping("/attendance/register")
    public ResponseEntity<?> register(Authentication a, @RequestParam String classId, @RequestParam String date, @RequestParam String session) {
        return run(a, p -> registers.get(p, classId, date, session));
    }

    @PostMapping("/attendance/register")
    @Operation(summary = "Save a register. Saving again with changes is a correction and needs correctionReason")
    @SuppressWarnings("unchecked")
    public ResponseEntity<?> saveRegister(Authentication a, @RequestBody Map<String, Object> b) {
        Map<String, String> m = b.get("marks") instanceof Map<?, ?> x ? (Map<String, String>) x : Map.of();
        return run(a, p -> registers.save(p, s(b, "classSectionId"), s(b, "date"), s(b, "session"), m, s(b, "correctionReason")));
    }

    // ---- hall tickets
    @GetMapping("/hall-tickets")
    public ResponseEntity<?> hallTickets(Authentication a, @RequestParam String classId, @RequestParam(required = false) String examId) {
        return run(a, p -> tickets.listForClass(p, classId, examId));
    }

    @PostMapping("/hall-tickets/release")
    @Operation(summary = "Class Teacher releases a fee-cleared student's hall ticket")
    public ResponseEntity<?> release(Authentication a, @RequestBody Map<String, Object> b) {
        return run(a, p -> tickets.release(p, s(b, "examId"), s(b, "studentId")));
    }

    @PostMapping("/hall-tickets/override")
    @Operation(summary = "Principal emergency override: reason + fresh SENSITIVE_STAFF_ACTION step-up token; audited")
    public ResponseEntity<?> override(Authentication a, @RequestBody Map<String, Object> b) {
        return run(a, p -> tickets.principalOverride(p, s(b, "examId"), s(b, "studentId"), s(b, "reason"), s(b, "stepUpToken")));
    }

    // ---- marks
    @GetMapping("/assessments/open")
    public ResponseEntity<?> openAssessments(Authentication a, @RequestParam(required = false) Integer grade) {
        return run(a, p -> marks.openAssessments(grade));
    }

    @GetMapping("/marks/my-sheets")
    public ResponseEntity<?> mySheets(Authentication a) {
        return run(a, marks::listMySheets);
    }

    @GetMapping("/marks/sheet")
    public ResponseEntity<?> sheet(Authentication a, @RequestParam String id) {
        return run(a, p -> marks.getSheet(p, id));
    }

    @PostMapping("/marks/sheet")
    @Operation(summary = "Subject Teacher saves (submit=false) or submits (submit=true) marks; AB for absent")
    @SuppressWarnings("unchecked")
    public ResponseEntity<?> saveSheet(Authentication a, @RequestBody Map<String, Object> b) {
        Map<String, Map<String, Object>> rows = b.get("rows") instanceof Map<?, ?> x ? (Map<String, Map<String, Object>>) x : Map.of();
        return run(a, p -> marks.saveSheet(p, s(b, "id"), rows, Boolean.TRUE.equals(b.get("submit"))));
    }

    @GetMapping("/marks/class-sheets")
    public ResponseEntity<?> classSheets(Authentication a, @RequestParam String assessmentId, @RequestParam String classId) {
        return run(a, p -> marks.listClassSheets(p, assessmentId, classId));
    }

    @PostMapping("/marks/review")
    @Operation(summary = "Class Teacher accepts or returns a submitted subject")
    public ResponseEntity<?> review(Authentication a, @RequestBody Map<String, Object> b) {
        return run(a, p -> marks.reviewSheet(p, s(b, "id"), s(b, "action"), s(b, "reason")));
    }

    @PostMapping("/report-cards/generate")
    public ResponseEntity<?> generate(Authentication a, @RequestBody Map<String, Object> b) {
        return run(a, p -> marks.generateReportCards(p, s(b, "assessmentId"), s(b, "classId")));
    }

    @GetMapping("/report-cards")
    public ResponseEntity<?> reportCards(Authentication a, @RequestParam String assessmentId, @RequestParam String classId) {
        return run(a, p -> marks.listReportCards(p, assessmentId, classId));
    }

    @PostMapping("/report-cards/remark")
    public ResponseEntity<?> remark(Authentication a, @RequestBody Map<String, Object> b) {
        return run(a, p -> marks.updateRemark(p, s(b, "id"), s(b, "remark")));
    }

    @PostMapping("/report-cards/submit")
    public ResponseEntity<?> submit(Authentication a, @RequestBody Map<String, Object> b) {
        return run(a, p -> marks.submitToPrincipal(p, s(b, "assessmentId"), s(b, "classId")));
    }

    @GetMapping("/report-cards/principal")
    public ResponseEntity<?> forPrincipal(Authentication a) {
        return run(a, marks::listForPrincipal);
    }

    @PostMapping("/report-cards/decision")
    @Operation(summary = "Principal approves or returns ONE card (never publishes)")
    public ResponseEntity<?> decide(Authentication a, @RequestBody Map<String, Object> b) {
        return run(a, p -> marks.principalDecide(p, s(b, "id"), s(b, "decision"), s(b, "note")));
    }

    @PostMapping("/results/publish")
    @Operation(summary = "Class Teacher publishes when ALL cards are approved; creates a new result version")
    public ResponseEntity<?> publish(Authentication a, @RequestBody Map<String, Object> b) {
        return run(a, p -> marks.publish(p, s(b, "assessmentId"), s(b, "classId")));
    }
}
