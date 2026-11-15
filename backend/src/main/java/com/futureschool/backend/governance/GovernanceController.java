package com.futureschool.backend.governance;

import com.futureschool.backend.auth.AuthFlowException;
import com.futureschool.backend.entity.ExamWindow;
import com.futureschool.backend.repository.ExamWindowRepository;
import com.futureschool.backend.security.AccessPolicy;
import com.futureschool.backend.security.SchoolPrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.function.Function;

/**
 * Governance (Admin drafts / executes, Principal approves), corrections to published marks,
 * and the office fee desk. Roles in SecurityConfig; permissions and relationships in services.
 */
@RestController
@Tag(name = "Governance & corrections", description = "Principal-approved changes, published-mark corrections, office fee desk")
public class GovernanceController {

    private final GovernanceService governance;
    private final CorrectionService corrections;
    private final FeeDeskService feeDesk;
    private final ExamWindowRepository exams;
    private final com.futureschool.backend.repository.AuditEventRepository audit;

    public GovernanceController(GovernanceService governance, CorrectionService corrections, FeeDeskService feeDesk, ExamWindowRepository exams,
                                com.futureschool.backend.repository.AuditEventRepository audit) {
        this.governance = governance;
        this.corrections = corrections;
        this.feeDesk = feeDesk;
        this.exams = exams;
        this.audit = audit;
    }

    /** Admin with REPORTS: this school's audit log, newest first (append-only; there is no edit or delete). */
    @GetMapping("/api/governance/audit")
    public ResponseEntity<?> auditLog(Authentication a) {
        return run(a, p -> {
            GovernanceService.requirePermission(p, "REPORTS");
            return audit.findAll().stream()
                    .sorted(Comparator.comparing(com.futureschool.backend.entity.AuditEvent::getAt).reversed())
                    .limit(500)
                    .map(e -> {
                        Map<String, Object> m = new LinkedHashMap<>();
                        m.put("id", e.getId());
                        m.put("schoolId", e.getSchoolId());
                        m.put("action", e.getAction());
                        m.put("actorId", e.getActorId());
                        m.put("actorRole", e.getActorRole());
                        m.put("targetId", e.getTargetId());
                        m.put("details", e.getDetails());
                        if (e.getReason() != null) m.put("reason", e.getReason());
                        m.put("at", e.getAt());
                        return m;
                    })
                    .toList();
        });
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

    @SuppressWarnings("unchecked")
    private static Map<String, Object> payload(Map<String, Object> b) {
        return b.get("payload") instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
    }

    // ---------------------------------------------------------------- governance
    @GetMapping("/api/governance/admin")
    public ResponseEntity<?> forAdmin(Authentication a) {
        return run(a, governance::listForAdmin);
    }

    @GetMapping("/api/governance/principal")
    public ResponseEntity<?> forPrincipal(Authentication a) {
        return run(a, governance::listForPrincipal);
    }

    @PostMapping("/api/governance/drafts")
    @Operation(summary = "Admin: create a draft (needs the permission for its kind)")
    public ResponseEntity<?> create(Authentication a, @RequestBody Map<String, Object> b) {
        return run(a, p -> governance.createDraft(p, s(b, "title"), payload(b)));
    }

    @PostMapping("/api/governance/{id}/edit")
    @Operation(summary = "Admin: change the payload. After approval this blocks execution until re-approved")
    public ResponseEntity<?> edit(Authentication a, @PathVariable String id, @RequestBody Map<String, Object> b) {
        return run(a, p -> governance.updateDraft(p, id, payload(b)));
    }

    @PostMapping("/api/governance/{id}/submit")
    public ResponseEntity<?> submit(Authentication a, @PathVariable String id) {
        return run(a, p -> governance.submit(p, id));
    }

    @PostMapping("/api/governance/{id}/decision")
    @Operation(summary = "Principal: APPROVE (needs a fresh SENSITIVE_STAFF_ACTION step-up token), RETURN or REJECT (need a note)")
    public ResponseEntity<?> decide(Authentication a, @PathVariable String id, @RequestBody Map<String, Object> b) {
        return run(a, p -> governance.principalDecide(p, id, s(b, "decision"), s(b, "note"), s(b, "stepUpToken")));
    }

    @PostMapping("/api/governance/{id}/execute")
    @Operation(summary = "Admin: execute an approved request. Re-validated; blocked if changed after approval")
    public ResponseEntity<?> execute(Authentication a, @PathVariable String id) {
        return run(a, p -> governance.execute(p, id));
    }

    @GetMapping("/api/governance/exams")
    public ResponseEntity<?> exams(Authentication a) {
        return run(a, p -> exams.findAll().stream().sorted(Comparator.comparing(ExamWindow::getStartsOn)).map(e -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", e.getId());
            m.put("schoolId", e.getSchoolId());
            m.put("name", e.getName());
            m.put("startsOn", e.getStartsOn());
            m.put("grades", Arrays.stream(e.getGradesCsv().split(",")).map(String::trim).map(Integer::parseInt).toList());
            m.put("clearanceRule", Map.of("categories", List.of(e.getClearanceCategoriesCsv().split(",")), "uptoInstalment", e.getClearanceUptoInstalment()));
            return m;
        }).toList());
    }

    // ---------------------------------------------------------------- corrections
    @GetMapping("/api/corrections/correctable")
    public ResponseEntity<?> correctable(Authentication a) {
        return run(a, corrections::listCorrectable);
    }

    @PostMapping("/api/corrections")
    @Operation(summary = "Subject Teacher raises a correction on the CURRENT published version of their subject")
    public ResponseEntity<?> raise(Authentication a, @RequestBody Map<String, Object> b) {
        return run(a, p -> corrections.raise(p, s(b, "resultId"), s(b, "subject"), s(b, "field"), b.get("to"), s(b, "reason")));
    }

    @GetMapping("/api/corrections/class")
    public ResponseEntity<?> forClass(Authentication a, @RequestParam String classId) {
        return run(a, p -> corrections.listForClassTeacher(p, classId));
    }

    @PostMapping("/api/corrections/{id}/verify")
    public ResponseEntity<?> verify(Authentication a, @PathVariable String id, @RequestBody Map<String, Object> b) {
        return run(a, p -> corrections.verify(p, id, s(b, "decision"), s(b, "note")));
    }

    @GetMapping("/api/corrections/principal")
    public ResponseEntity<?> correctionsForPrincipal(Authentication a) {
        return run(a, corrections::listForPrincipal);
    }

    @PostMapping("/api/corrections/{id}/decision")
    public ResponseEntity<?> correctionDecision(Authentication a, @PathVariable String id, @RequestBody Map<String, Object> b) {
        return run(a, p -> corrections.principalDecide(p, id, s(b, "decision"), s(b, "note"), s(b, "stepUpToken")));
    }

    @PostMapping("/api/corrections/{id}/republish")
    @Operation(summary = "Class Teacher republishes an approved correction as a NEW version")
    public ResponseEntity<?> republish(Authentication a, @PathVariable String id) {
        return run(a, p -> corrections.republish(p, id));
    }

    // ---------------------------------------------------------------- office fee desk
    @GetMapping("/api/office/fees/students")
    public ResponseEntity<?> search(Authentication a, @RequestParam(required = false, defaultValue = "") String q) {
        return run(a, p -> feeDesk.search(p, q));
    }

    @GetMapping("/api/office/fees/account")
    public ResponseEntity<?> account(Authentication a, @RequestParam String studentId) {
        return run(a, p -> feeDesk.account(p, studentId));
    }

    @GetMapping("/api/office/fees/alerts")
    @Operation(summary = "Payment reconciliation and late-capture webhook alerts for the office (FINANCE)")
    public ResponseEntity<?> paymentAlerts(Authentication a) {
        return run(a, feeDesk::paymentAlerts);
    }

    @PostMapping("/api/office/fees/cash")
    @Operation(summary = "Record cash received at the office (FINANCE). Prototype: no money moves")
    public ResponseEntity<?> cash(Authentication a, @RequestBody Map<String, Object> b) {
        long amount = b.get("amount") instanceof Number n ? n.longValue() : 0;
        return run(a, p -> feeDesk.recordCash(p, s(b, "studentId"), amount, s(b, "note")));
    }
}
