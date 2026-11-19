package com.futureschool.backend.roster;

import com.futureschool.backend.auth.AuthFlowException;
import com.futureschool.backend.security.AccessPolicy;
import com.futureschool.backend.security.SchoolPrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/**
 * Start-of-year roster management. Roles: SecurityConfig (/api/admin/**: GET for Principal/Admin,
 * everything else Admin only). Permissions (ADMISSIONS, FINANCE) and school scope: RosterService.
 */
@RestController
@RequestMapping("/api/admin/roster")
@Tag(name = "Academic-year roster", description = "Prepare a new academic year: promote, keep back, exit and add students; year fees")
public class RosterController {

    private final RosterService roster;

    public RosterController(RosterService roster) {
        this.roster = roster;
    }

    public record YearRequest(String name, String startDate, String endDate) {
    }

    public record PlanRequest(List<RosterService.Decision> decisions, List<RosterService.NewStudent> newStudents) {
    }

    public record ScheduleRequest(List<RosterService.ScheduleItem> instalments) {
    }

    public record ChargesRequest(Map<String, Long> annualFeeByGrade) {
    }

    @GetMapping("/years")
    @Operation(summary = "Academic years of this school (current, planned, past)")
    public ResponseEntity<?> years(Authentication a) {
        return run(a, roster::listYears);
    }

    @PostMapping("/years")
    @Operation(summary = "Prepare the next academic year (idempotent for the same name and dates)")
    public ResponseEntity<?> createYear(Authentication a, @RequestBody YearRequest b) {
        return run(a, p -> roster.createYear(p, b.name(), b.startDate(), b.endDate()));
    }

    @GetMapping("/years/{yearId}/draft")
    @Operation(summary = "Current roster with suggestions and saved decisions for the year")
    public ResponseEntity<?> draft(Authentication a, @PathVariable String yearId) {
        return run(a, p -> roster.draft(p, yearId));
    }

    @PostMapping("/years/{yearId}/preview")
    @Operation(summary = "Validate a plan without saving anything")
    public ResponseEntity<?> preview(Authentication a, @PathVariable String yearId, @RequestBody PlanRequest b) {
        return run(a, p -> roster.preview(p, yearId, b.decisions(), b.newStudents()));
    }

    @PostMapping("/years/{yearId}/apply")
    @Operation(summary = "Save a plan: all rows or none; repeating it changes nothing")
    public ResponseEntity<?> apply(Authentication a, @PathVariable String yearId, @RequestBody PlanRequest b) {
        return run(a, p -> roster.apply(p, yearId, b.decisions(), b.newStudents()));
    }

    @PostMapping("/years/{yearId}/start")
    @Operation(summary = "Start the planned year: students move to their new classes, leavers become Exited")
    public ResponseEntity<?> start(Authentication a, @PathVariable String yearId) {
        return run(a, p -> roster.start(p, yearId));
    }

    @PutMapping("/years/{yearId}/fee-schedule")
    @Operation(summary = "Finance: instalments and due dates for the year")
    public ResponseEntity<?> schedule(Authentication a, @PathVariable String yearId, @RequestBody ScheduleRequest b) {
        return run(a, p -> roster.setFeeSchedule(p, yearId, b.instalments()));
    }

    @PostMapping("/years/{yearId}/fee-charges")
    @Operation(summary = "Finance: charge the annual school fee per grade for everyone enrolled in the year (idempotent)")
    public ResponseEntity<?> charges(Authentication a, @PathVariable String yearId, @RequestBody ChargesRequest b) {
        return run(a, p -> roster.generateCharges(p, yearId, b.annualFeeByGrade()));
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
}
