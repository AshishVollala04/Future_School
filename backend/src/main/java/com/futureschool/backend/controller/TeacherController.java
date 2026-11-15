package com.futureschool.backend.controller;

import com.futureschool.backend.auth.AuthFlowException;
import com.futureschool.backend.entity.Teacher;
import com.futureschool.backend.governance.GovernanceService;
import com.futureschool.backend.security.AccessPolicy;
import com.futureschool.backend.service.TeacherService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/teachers")
@Tag(name = "Teachers & Faculty", description = "Endpoints for managing teachers and faculty profiles")
public class TeacherController {

    private final TeacherService teacherService;

    public TeacherController(TeacherService teacherService) {
        this.teacherService = teacherService;
    }

    @GetMapping
    @Operation(summary = "Get all teachers")
    public ResponseEntity<List<Teacher>> getAllTeachers() {
        return ResponseEntity.ok(teacherService.getAllTeachers());
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get teacher by ID or TeacherId (e.g. TCH0001)")
    public ResponseEntity<?> getTeacherById(@PathVariable String id) {
        return teacherService.getTeacherById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    @Operation(summary = "Create teacher (auto-creates teacher login account)")
    public ResponseEntity<?> createTeacher(
            Authentication auth,
            @RequestBody Teacher teacher,
            @RequestParam(required = false) String initialPassword
    ) {
        try {
            GovernanceService.requireAnyPermission(AccessPolicy.principal(auth), "SECURITY", "ACADEMIC_OPS");
            return ResponseEntity.ok(teacherService.createTeacher(teacher, initialPassword));
        } catch (AuthFlowException e) {
            return ResponseEntity.status(e.getStatus()).body(Map.of("error", e.getMessage(), "code", e.getCode()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update teacher details")
    public ResponseEntity<?> updateTeacher(Authentication auth, @PathVariable String id, @RequestBody Teacher updated) {
        try {
            GovernanceService.requireAnyPermission(AccessPolicy.principal(auth), "SECURITY", "ACADEMIC_OPS");
            return ResponseEntity.ok(teacherService.updateTeacher(id, updated));
        } catch (AuthFlowException e) {
            return ResponseEntity.status(e.getStatus()).body(Map.of("error", e.getMessage(), "code", e.getCode()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Deactivate teacher and their school membership")
    public ResponseEntity<?> deleteTeacher(Authentication auth, @PathVariable String id) {
        try {
            GovernanceService.requireAnyPermission(AccessPolicy.principal(auth), "SECURITY", "ACADEMIC_OPS");
            teacherService.deleteTeacher(id);
            return ResponseEntity.ok(Map.of("success", true, "message", "Teacher deactivated: " + id));
        } catch (AuthFlowException e) {
            return ResponseEntity.status(e.getStatus()).body(Map.of("error", e.getMessage(), "code", e.getCode()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
