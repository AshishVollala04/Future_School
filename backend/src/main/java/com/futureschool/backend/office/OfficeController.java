package com.futureschool.backend.office;

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

/** Complaints, transport, pickup passes and staff access. Permissions are checked in the services. */
@RestController
@Tag(name = "Office", description = "Complaints, transport, pickup passes, staff access")
public class OfficeController {

    private final OfficeService office;
    private final StaffAccessService staff;
    private final TeacherPinService pins;

    public OfficeController(OfficeService office, StaffAccessService staff, TeacherPinService pins) {
        this.office = office;
        this.staff = staff;
        this.pins = pins;
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

    // ---- parent: complaints
    @GetMapping("/api/parent/complaints")
    public ResponseEntity<?> myComplaints(Authentication a) {
        return run(a, office::myComplaints);
    }

    @PostMapping("/api/parent/complaints")
    public ResponseEntity<?> raise(Authentication a, @RequestBody Map<String, Object> b) {
        return run(a, p -> office.raiseComplaint(p, s(b, "category"), s(b, "subject"), s(b, "description")));
    }

    @PostMapping("/api/parent/complaints/{id}/confirm")
    public ResponseEntity<?> confirm(Authentication a, @PathVariable String id) {
        return run(a, p -> office.confirmResolved(p, id));
    }

    @PostMapping("/api/parent/complaints/{id}/reopen")
    public ResponseEntity<?> reopen(Authentication a, @PathVariable String id, @RequestBody Map<String, Object> b) {
        return run(a, p -> office.reopen(p, id, s(b, "reason")));
    }

    // ---- parent: transport
    @GetMapping("/api/parent/transport")
    public ResponseEntity<?> myTransport(Authentication a) {
        return run(a, office::myTransport);
    }

    @PostMapping("/api/parent/transport/requests")
    public ResponseEntity<?> requestTransport(Authentication a, @RequestBody Map<String, Object> b) {
        return run(a, p -> office.requestTransport(p, s(b, "kind"), s(b, "toRouteId"), s(b, "stopName"), s(b, "reason"), s(b, "effectiveFrom")));
    }

    @PostMapping("/api/parent/transport/requests/{id}/withdraw")
    public ResponseEntity<?> withdraw(Authentication a, @PathVariable String id) {
        return run(a, p -> office.withdrawTransport(p, id));
    }

    // ---- parent: pickup
    @GetMapping("/api/parent/pickup")
    public ResponseEntity<?> myPickup(Authentication a) {
        return run(a, office::myPickup);
    }

    @PostMapping("/api/parent/pickup/passes")
    @Operation(summary = "Issue a 2-hour one-time pickup pass; needs a fresh PICKUP_AUTHORIZATION step-up token. The code is returned once")
    public ResponseEntity<?> issuePass(Authentication a, @RequestBody Map<String, Object> b) {
        return run(a, p -> office.issuePass(p, s(b, "personName"), s(b, "relation"), s(b, "mobile"), s(b, "reason"), s(b, "stepUpToken")));
    }

    @PostMapping("/api/parent/pickup/passes/{id}/cancel")
    public ResponseEntity<?> cancelPass(Authentication a, @PathVariable String id) {
        return run(a, p -> office.cancelPass(p, id));
    }

    // ---- staff
    @GetMapping("/api/staff/complaints")
    @Operation(summary = "Admin with COMPLAINTS: all; Principal: safety complaints")
    public ResponseEntity<?> schoolComplaints(Authentication a) {
        return run(a, office::schoolComplaints);
    }

    @PostMapping("/api/staff/complaints/{id}/respond")
    public ResponseEntity<?> respond(Authentication a, @PathVariable String id, @RequestBody Map<String, Object> b) {
        return run(a, p -> office.respond(p, id, s(b, "note"), s(b, "status")));
    }

    @PostMapping("/api/staff/pickup/verify")
    @Operation(summary = "Gate check: a valid pass is accepted once and then marked used")
    public ResponseEntity<?> verifyPass(Authentication a, @RequestBody Map<String, Object> b) {
        return run(a, p -> office.verifyPass(p, s(b, "code")));
    }

    @GetMapping("/api/office/transport/routes")
    public ResponseEntity<?> routes(Authentication a) {
        return run(a, office::listRoutes);
    }

    @GetMapping("/api/office/transport/requests")
    public ResponseEntity<?> transportRequests(Authentication a) {
        return run(a, office::listTransportRequests);
    }

    @PostMapping("/api/office/transport/requests/{id}/decision")
    public ResponseEntity<?> decide(Authentication a, @PathVariable String id, @RequestBody Map<String, Object> b) {
        return run(a, p -> office.decideTransport(p, id, s(b, "decision"), s(b, "note")));
    }

    @GetMapping("/api/office/staff")
    public ResponseEntity<?> staffList(Authentication a) {
        return run(a, staff::list);
    }

    @PostMapping("/api/office/staff/invite")
    @SuppressWarnings("unchecked")
    public ResponseEntity<?> invite(Authentication a, @RequestBody Map<String, Object> b) {
        List<String> perms = b.get("permissions") instanceof List<?> l ? (List<String>) l : List.of();
        return run(a, p -> staff.invite(p, s(b, "name"), s(b, "email"), s(b, "title"), perms, s(b, "role")));
    }

    @PostMapping("/api/office/staff/{accountId}/status")
    @Operation(summary = "Suspend / reactivate an Admin (reason + fresh SENSITIVE_STAFF_ACTION OTP; keeps 2 active Admins)")
    public ResponseEntity<?> setStatus(Authentication a, @PathVariable String accountId, @RequestBody Map<String, Object> b) {
        return run(a, p -> staff.setStatus(p, accountId, s(b, "status"), s(b, "reason"), s(b, "stepUpToken")));
    }

    // ------------------------------------------------------------------ teacher sign-in PIN

    @GetMapping("/api/staff/pin")
    @Operation(summary = "Teacher: is a sign-in PIN set / locked (never the PIN)")
    public ResponseEntity<?> myPin(Authentication a) {
        return run(a, pins::myStatus);
    }

    @PostMapping("/api/staff/pin")
    @Operation(summary = "Teacher: set the required 4-digit sign-in PIN (first time), or change it (fresh SENSITIVE_STAFF_ACTION OTP)")
    public ResponseEntity<?> setPin(Authentication a, @RequestBody Map<String, Object> b) {
        return run(a, p -> pins.setMine(p, s(b, "pin"), s(b, "stepUpToken")));
    }

    @GetMapping("/api/office/teacher-pins")
    @Operation(summary = "Admin (SECURITY): teachers of this school and their PIN status")
    public ResponseEntity<?> teacherPins(Authentication a) {
        return run(a, pins::list);
    }

    @PostMapping("/api/office/teacher-pins/{membershipId}/reset")
    @Operation(summary = "Admin (SECURITY): reset (remove) a teacher's PIN, e.g. when locked. Reason + fresh OTP; audited")
    public ResponseEntity<?> resetPin(Authentication a, @PathVariable String membershipId, @RequestBody Map<String, Object> b) {
        return run(a, p -> pins.reset(p, membershipId, s(b, "reason"), s(b, "stepUpToken")));
    }
}
