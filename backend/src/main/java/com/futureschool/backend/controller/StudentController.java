package com.futureschool.backend.controller;

import com.futureschool.backend.auth.AuthFlowException;
import com.futureschool.backend.entity.Student;
import com.futureschool.backend.governance.GovernanceService;
import com.futureschool.backend.security.AccessPolicy;
import com.futureschool.backend.service.StudentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/students")
@Tag(name = "Students", description = "Endpoints for student admissions, profiles, hall tickets, and exit records")
public class StudentController {

    private final StudentService studentService;
    private final com.futureschool.backend.teaching.Teaching teaching;

    public StudentController(StudentService studentService, com.futureschool.backend.teaching.Teaching teaching) {
        this.studentService = studentService;
        this.teaching = teaching;
    }

    @GetMapping
    @Operation(summary = "Get all students with optional classId or search query")
    public ResponseEntity<List<Student>> getStudents(
            @RequestParam(required = false) String classId,
            @RequestParam(required = false) String search
    ) {
        if (classId != null && !classId.isBlank()) {
            return ResponseEntity.ok(studentService.getStudentsByClassId(classId));
        }
        if (search != null && !search.isBlank()) {
            return ResponseEntity.ok(studentService.searchStudents(search));
        }
        return ResponseEntity.ok(studentService.getAllStudents());
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get student by ID (e.g. STU0001) or Admission Number")
    public ResponseEntity<?> getStudentById(@PathVariable String id) {
        return studentService.getStudentById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/class/{classId}")
    @Operation(summary = "Get all students in a specific class / section")
    public ResponseEntity<List<Student>> getStudentsByClass(@PathVariable String classId) {
        return ResponseEntity.ok(studentService.getStudentsByClassId(classId));
    }

    @GetMapping("/parent/{parentAccountId}")
    @Operation(summary = "Get all wards / siblings belonging to a parent")
    public ResponseEntity<List<Student>> getStudentsByParent(@PathVariable String parentAccountId) {
        return ResponseEntity.ok(studentService.getStudentsByParentAccountId(parentAccountId));
    }

    @PostMapping("/by-ids")
    @Operation(summary = "Get list of students by array of student IDs")
    public ResponseEntity<List<Student>> getStudentsByIds(org.springframework.security.core.Authentication auth, @RequestBody List<String> ids) {
        com.futureschool.backend.security.SchoolPrincipal p = com.futureschool.backend.security.AccessPolicy.principal(auth);
        if (p == null) return ResponseEntity.status(401).build();
        // Parents/students get only their own children; staff any student in their school.
        List<String> allowed = p.isStaff() ? ids : ids.stream()
                .filter(id -> p.role() == com.futureschool.backend.entity.UserRole.PARENT
                        ? p.account().getLinkedStudentIds().contains(id) && id.equals(p.sessionStudentId())
                        : id.equals(p.account().getStudentId()))
                .toList();
        return ResponseEntity.ok(studentService.getStudentsByIds(allowed));
    }

    @PostMapping
    @Operation(summary = "Create / admit a new student (auto-creates student login account)")
    public ResponseEntity<?> createStudent(
            Authentication auth,
            @RequestBody Student student,
            @RequestParam(required = false) String initialPassword
    ) {
        try {
            var p = AccessPolicy.principal(auth);
            GovernanceService.requirePermission(p, "ADMISSIONS");
            Student created = studentService.createStudent(student, initialPassword);
            teaching.record(p, "STUDENT_ADDED", created.getId(), "Added to " + created.getClassName() + "-" + created.getSection() + ".", null);
            return ResponseEntity.ok(created);
        } catch (AuthFlowException e) {
            return ResponseEntity.status(e.getStatus()).body(Map.of("error", e.getMessage(), "code", e.getCode()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update student details")
    public ResponseEntity<?> updateStudent(Authentication auth, @PathVariable String id, @RequestBody Student updated) {
        try {
            GovernanceService.requirePermission(AccessPolicy.principal(auth), "ADMISSIONS");
            return ResponseEntity.ok(studentService.updateStudent(id, updated));
        } catch (AuthFlowException e) {
            return ResponseEntity.status(e.getStatus()).body(Map.of("error", e.getMessage(), "code", e.getCode()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Deactivate student and school membership")
    public ResponseEntity<?> deleteStudent(Authentication auth, @PathVariable String id) {
        try {
            GovernanceService.requirePermission(AccessPolicy.principal(auth), "ADMISSIONS");
            studentService.deleteStudent(id);
            return ResponseEntity.ok(Map.of("success", true, "message", "Student deactivated: " + id));
        } catch (AuthFlowException e) {
            return ResponseEntity.status(e.getStatus()).body(Map.of("error", e.getMessage(), "code", e.getCode()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/{id}/exit")
    @Operation(summary = "Record student transfer / exit record")
    public ResponseEntity<?> recordStudentExit(
            Authentication auth,
            @PathVariable String id,
            @RequestBody Map<String, String> body
    ) {
        try {
            var p = AccessPolicy.principal(auth);
            GovernanceService.requirePermission(p, "ADMISSIONS");
            String effectiveDate = body.getOrDefault("effectiveDate", java.time.LocalDate.now().toString());
            String reason = body.getOrDefault("reason", "Transferred");
            String destinationSchool = body.get("destinationSchool");
            Student exited = studentService.recordExit(id, effectiveDate, reason, destinationSchool);
            teaching.record(p, "STUDENT_EXITED", exited.getId(), "Exit recorded, effective " + effectiveDate + ". Records are kept.", reason);
            return ResponseEntity.ok(exited);
        } catch (AuthFlowException e) {
            return ResponseEntity.status(e.getStatus()).body(Map.of("error", e.getMessage(), "code", e.getCode()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Retired: it set a flag with no fee-clearance check. Hall tickets are released only by the Class
     * Teacher after server-computed fee clearance (/api/staff/hall-tickets/release), or by the audited
     * Principal override.
     */
    @PatchMapping("/{id}/hall-ticket")
    @Operation(summary = "Retired: use the Class Teacher hall-ticket release")
    public ResponseEntity<?> updateHallTicket(@PathVariable String id, @RequestBody(required = false) Map<String, Boolean> body) {
        return ResponseEntity.status(410).body(Map.of("success", false, "code", "RETIRED",
                "error", "Hall tickets are released by the Class Teacher after fee clearance."));
    }
}
