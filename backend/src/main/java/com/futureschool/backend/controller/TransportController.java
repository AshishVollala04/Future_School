package com.futureschool.backend.controller;

import com.futureschool.backend.auth.AuthFlowException;
import com.futureschool.backend.entity.TransportRoute;
import com.futureschool.backend.governance.GovernanceService;
import com.futureschool.backend.security.AccessPolicy;
import com.futureschool.backend.service.TransportService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/transport")
@Tag(name = "Transport & Fleet", description = "Endpoints for school bus routes, driver details, and student stop assignments")
public class TransportController {

    private final TransportService transportService;

    public TransportController(TransportService transportService) {
        this.transportService = transportService;
    }

    @GetMapping("/routes")
    @Operation(summary = "Get all active bus routes and vehicle allocations")
    public ResponseEntity<List<TransportRoute>> getRoutes() {
        return ResponseEntity.ok(transportService.getAllRoutes());
    }

    @PostMapping("/routes")
    @Operation(summary = "Create or update a school bus route")
    public ResponseEntity<?> saveRoute(Authentication auth, @RequestBody TransportRoute route) {
        try {
            GovernanceService.requirePermission(AccessPolicy.principal(auth), "TRANSPORT");
            return ResponseEntity.ok(transportService.saveRoute(route));
        } catch (AuthFlowException e) {
            return ResponseEntity.status(e.getStatus()).body(Map.of("error", e.getMessage(), "code", e.getCode()));
        }
    }

    @DeleteMapping("/routes/{id}")
    @Operation(summary = "Delete bus route")
    public ResponseEntity<?> deleteRoute(Authentication auth, @PathVariable String id) {
        try {
            GovernanceService.requirePermission(AccessPolicy.principal(auth), "TRANSPORT");
            transportService.deleteRoute(id);
            return ResponseEntity.ok(Map.of("success", true, "message", "Route deleted: " + id));
        } catch (AuthFlowException e) {
            return ResponseEntity.status(e.getStatus()).body(Map.of("error", e.getMessage(), "code", e.getCode()));
        }
    }

    @PostMapping("/assign")
    @Operation(summary = "Assign a student to a transport route")
    public ResponseEntity<?> assignStudent(Authentication auth, @RequestBody Map<String, String> body) {
        try {
            GovernanceService.requirePermission(AccessPolicy.principal(auth), "TRANSPORT");
            String studentId = body.get("studentId");
            String routeId = body.get("routeId");
            return ResponseEntity.ok(transportService.assignStudentToRoute(studentId, routeId));
        } catch (AuthFlowException e) {
            return ResponseEntity.status(e.getStatus()).body(Map.of("error", e.getMessage(), "code", e.getCode()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
