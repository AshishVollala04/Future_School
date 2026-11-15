package com.futureschool.backend.controller;

import com.futureschool.backend.auth.AuthFlowException;
import com.futureschool.backend.entity.Parent;
import com.futureschool.backend.governance.GovernanceService;
import com.futureschool.backend.security.AccessPolicy;
import com.futureschool.backend.service.ParentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/parents")
@Tag(name = "Parents", description = "Endpoints for managing parent accounts and multi-child relationships")
public class ParentController {

    private final ParentService parentService;

    public ParentController(ParentService parentService) {
        this.parentService = parentService;
    }

    @GetMapping
    @Operation(summary = "Get all parents")
    public ResponseEntity<List<Parent>> getAllParents() {
        return ResponseEntity.ok(parentService.getAllParents());
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get parent by ID or Login ID (e.g. PAR0001)")
    public ResponseEntity<?> getParentById(@PathVariable String id) {
        return parentService.getParentById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    @Operation(summary = "Create parent (auto-creates parent login account)")
    public ResponseEntity<?> createParent(
            Authentication auth,
            @RequestBody Parent parent,
            @RequestParam(required = false) String initialPassword
    ) {
        try {
            GovernanceService.requireAnyPermission(AccessPolicy.principal(auth), "ADMISSIONS", "SECURITY");
            return ResponseEntity.ok(parentService.createParent(parent, initialPassword));
        } catch (AuthFlowException e) {
            return ResponseEntity.status(e.getStatus()).body(Map.of("error", e.getMessage(), "code", e.getCode()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update parent details")
    public ResponseEntity<?> updateParent(Authentication auth, @PathVariable String id, @RequestBody Parent updated) {
        try {
            GovernanceService.requireAnyPermission(AccessPolicy.principal(auth), "ADMISSIONS", "SECURITY");
            return ResponseEntity.ok(parentService.updateParent(id, updated));
        } catch (AuthFlowException e) {
            return ResponseEntity.status(e.getStatus()).body(Map.of("error", e.getMessage(), "code", e.getCode()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/{parentLoginId}/link-student/{studentId}")
    @Operation(summary = "Link a student/ward to this parent for multi-child support")
    public ResponseEntity<?> linkStudentToParent(Authentication auth, @PathVariable String parentLoginId, @PathVariable String studentId) {
        try {
            GovernanceService.requireAnyPermission(AccessPolicy.principal(auth), "ADMISSIONS", "SECURITY");
            parentService.linkStudentToParent(parentLoginId, studentId);
            return ResponseEntity.ok(Map.of("success", true, "message", "Student " + studentId + " linked to Parent " + parentLoginId));
        } catch (AuthFlowException e) {
            return ResponseEntity.status(e.getStatus()).body(Map.of("error", e.getMessage(), "code", e.getCode()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Deactivate parent school membership")
    public ResponseEntity<?> deleteParent(Authentication auth, @PathVariable String id) {
        try {
            GovernanceService.requireAnyPermission(AccessPolicy.principal(auth), "ADMISSIONS", "SECURITY");
            parentService.deleteParent(id);
            return ResponseEntity.ok(Map.of("success", true, "message", "Parent deactivated: " + id));
        } catch (AuthFlowException e) {
            return ResponseEntity.status(e.getStatus()).body(Map.of("error", e.getMessage(), "code", e.getCode()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
