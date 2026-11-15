package com.futureschool.backend.leave;

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

/** Student leave, teacher leave, substitution and timetables. Relationship checks are in LeaveService. */
@RestController
@Tag(name = "Leave & substitution", description = "Student leave (Flow 1), teacher leave and substitution (Flow 6), timetables")
public class LeaveController {

    private final LeaveService leave;

    public LeaveController(LeaveService leave) {
        this.leave = leave;
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

    // ---- parent (session child only)
    @GetMapping("/api/parent/leave")
    public ResponseEntity<?> childLeave(Authentication a) {
        return run(a, leave::listForChild);
    }

    @PostMapping("/api/parent/leave")
    @Operation(summary = "Apply for the session child's leave (up to 7 days back, max 15 days)")
    public ResponseEntity<?> apply(Authentication a, @RequestBody Map<String, Object> b) {
        return run(a, p -> leave.apply(p, s(b, "fromDate"), s(b, "toDate"), s(b, "kind"), s(b, "reason")));
    }

    @PostMapping("/api/parent/leave/{id}/withdraw")
    public ResponseEntity<?> withdraw(Authentication a, @PathVariable String id) {
        return run(a, p -> leave.withdraw(p, id));
    }

    @GetMapping("/api/parent/timetable")
    public ResponseEntity<?> childTimetable(Authentication a) {
        return run(a, leave::childTimetable);
    }

    // ---- Class Teacher
    @GetMapping("/api/staff/leave/class")
    public ResponseEntity<?> classLeave(Authentication a, @RequestParam String classId) {
        return run(a, p -> leave.listForClass(p, classId));
    }

    @PostMapping("/api/staff/leave/{id}/decision")
    @Operation(summary = "Class Teacher approves or rejects (reason required) a student leave request")
    public ResponseEntity<?> decideStudent(Authentication a, @PathVariable String id, @RequestBody Map<String, Object> b) {
        return run(a, p -> leave.decideStudentLeave(p, id, s(b, "decision"), s(b, "note")));
    }

    // ---- teacher's own leave + timetable + duties
    @GetMapping("/api/staff/my-leave")
    public ResponseEntity<?> myLeave(Authentication a) {
        return run(a, leave::myLeaves);
    }

    @PostMapping("/api/staff/my-leave")
    public ResponseEntity<?> applyTeacher(Authentication a, @RequestBody Map<String, Object> b) {
        return run(a, p -> leave.applyTeacherLeave(p, s(b, "fromDate"), s(b, "toDate"), s(b, "kind"), s(b, "reason")));
    }

    @GetMapping("/api/staff/my-periods")
    public ResponseEntity<?> myPeriods(Authentication a, @RequestParam int day) {
        return run(a, p -> leave.myPeriods(p, day));
    }

    @GetMapping("/api/staff/substitution/my-duties")
    public ResponseEntity<?> myDuties(Authentication a) {
        return run(a, leave::myDuties);
    }

    // ---- Principal / Admin
    @GetMapping("/api/staff/teacher-leave")
    public ResponseEntity<?> teacherLeave(Authentication a) {
        return run(a, leave::listTeacherLeave);
    }

    @PostMapping("/api/staff/teacher-leave/{id}/decision")
    public ResponseEntity<?> decideTeacher(Authentication a, @PathVariable String id, @RequestBody Map<String, Object> b) {
        return run(a, p -> leave.decideTeacherLeave(p, id, s(b, "decision"), s(b, "note")));
    }

    @GetMapping("/api/staff/substitution")
    @Operation(summary = "Admin (ACADEMIC_OPS): periods of approved teacher leave and who is free")
    public ResponseEntity<?> needs(Authentication a) {
        return run(a, leave::substitutionNeeds);
    }

    @PostMapping("/api/staff/substitution")
    public ResponseEntity<?> assign(Authentication a, @RequestBody Map<String, Object> b) {
        int period = b.get("period") instanceof Number n ? n.intValue() : -1;
        return run(a, p -> leave.assign(p, s(b, "leaveId"), s(b, "date"), s(b, "classSectionId"), period, s(b, "substituteStaffId")));
    }
}
