package com.futureschool.backend.owner;

import com.futureschool.backend.auth.AuthFlowException;
import com.futureschool.backend.security.AccessPolicy;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@Tag(name = "Owner's dashboard", description = "Today's fees and attendance across the branches a person manages")
public class OwnerDashboardController {

    private final OwnerDashboardService owner;

    public OwnerDashboardController(OwnerDashboardService owner) {
        this.owner = owner;
    }

    @GetMapping("/api/owner/overview")
    @Operation(summary = "Fees received today (cash / online / simulated), dues, and today's attendance, per branch and in total")
    public ResponseEntity<?> overview(Authentication a) {
        try {
            return ResponseEntity.ok(owner.overview(AccessPolicy.principal(a)));
        } catch (AuthFlowException e) {
            Map<String, Object> err = new LinkedHashMap<>();
            err.put("success", false);
            err.put("error", e.getMessage());
            err.put("code", e.getCode());
            return ResponseEntity.status(e.getStatus()).body(err);
        }
    }
}
