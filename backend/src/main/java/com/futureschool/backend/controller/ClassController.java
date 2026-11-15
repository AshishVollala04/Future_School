package com.futureschool.backend.controller;

import com.futureschool.backend.auth.AuthFlowException;
import com.futureschool.backend.entity.SchoolClass;
import com.futureschool.backend.governance.GovernanceService;
import com.futureschool.backend.security.AccessPolicy;
import com.futureschool.backend.service.ClassService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/classes")
@Tag(name = "Classes & Sections", description = "Endpoints for managing classes and sections")
public class ClassController {

    private final ClassService classService;

    public ClassController(ClassService classService) {
        this.classService = classService;
    }

    @GetMapping
    @Operation(summary = "Get all active classes and sections")
    public ResponseEntity<List<SchoolClass>> getAllClasses() {
        return ResponseEntity.ok(classService.getAllActiveClasses());
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get class by ID (e.g. class-10-a)")
    public ResponseEntity<?> getClassById(@PathVariable String id) {
        return classService.getClassById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    @Operation(summary = "Create a new class / section")
    public ResponseEntity<?> createClass(Authentication auth, @RequestBody SchoolClass schoolClass) {
        try {
            GovernanceService.requirePermission(AccessPolicy.principal(auth), "ACADEMIC_OPS");
            return ResponseEntity.ok(classService.createClass(schoolClass));
        } catch (AuthFlowException e) {
            return ResponseEntity.status(e.getStatus()).body(Map.of("error", e.getMessage(), "code", e.getCode()));
        }
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update an existing class")
    public ResponseEntity<?> updateClass(Authentication auth, @PathVariable String id, @RequestBody SchoolClass updated) {
        try {
            GovernanceService.requirePermission(AccessPolicy.principal(auth), "ACADEMIC_OPS");
            return ResponseEntity.ok(classService.updateClass(id, updated));
        } catch (AuthFlowException e) {
            return ResponseEntity.status(e.getStatus()).body(Map.of("error", e.getMessage(), "code", e.getCode()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete class by ID")
    public ResponseEntity<?> deleteClass(Authentication auth, @PathVariable String id) {
        try {
            GovernanceService.requirePermission(AccessPolicy.principal(auth), "ACADEMIC_OPS");
            classService.deleteClass(id);
            return ResponseEntity.ok(Map.of("success", true, "message", "Class deleted: " + id));
        } catch (AuthFlowException e) {
            return ResponseEntity.status(e.getStatus()).body(Map.of("error", e.getMessage(), "code", e.getCode()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // --- Subject Allocation Endpoints ---
    @GetMapping("/allocations")
    @Operation(summary = "Get all subject allocations (optional filter by classId or teacherId)")
    public ResponseEntity<List<com.futureschool.backend.entity.SubjectAllocation>> getAllAllocations(
            @RequestParam(required = false) String classId,
            @RequestParam(required = false) String teacherId
    ) {
        if (classId != null && !classId.isBlank()) {
            return ResponseEntity.ok(classService.getSubjectAllocationsByClass(classId));
        }
        if (teacherId != null && !teacherId.isBlank()) {
            return ResponseEntity.ok(classService.getSubjectAllocationsByTeacher(teacherId));
        }
        return ResponseEntity.ok(classService.getAllSubjectAllocations());
    }

    @PostMapping("/allocations")
    @Operation(summary = "Assign / allocate subject to faculty member with role (Teacher, Class Teacher, Principal, HOD)")
    public ResponseEntity<?> saveAllocation(Authentication auth, @RequestBody com.futureschool.backend.entity.SubjectAllocation allocation) {
        try {
            GovernanceService.requirePermission(AccessPolicy.principal(auth), "ACADEMIC_OPS");
            return ResponseEntity.ok(classService.saveSubjectAllocation(allocation));
        } catch (AuthFlowException e) {
            return ResponseEntity.status(e.getStatus()).body(Map.of("error", e.getMessage(), "code", e.getCode()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/allocations/{id}")
    @Operation(summary = "Delete subject allocation by ID")
    public ResponseEntity<?> deleteAllocation(Authentication auth, @PathVariable String id) {
        try {
            GovernanceService.requirePermission(AccessPolicy.principal(auth), "ACADEMIC_OPS");
            classService.deleteSubjectAllocation(id);
            return ResponseEntity.ok(Map.of("success", true, "message", "Allocation deleted: " + id));
        } catch (AuthFlowException e) {
            return ResponseEntity.status(e.getStatus()).body(Map.of("error", e.getMessage(), "code", e.getCode()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
