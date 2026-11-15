package com.futureschool.backend.alerts;

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

/** WhatsApp alerts: office log and settings, fee reminders, and the parent's on/off switch. */
@RestController
@Tag(name = "Parent alerts", description = "WhatsApp absence alerts and fee reminders")
public class AlertController {

    private final AlertService alerts;

    public AlertController(AlertService alerts) {
        this.alerts = alerts;
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

    private static Boolean bool(Map<String, Object> b, String k) {
        Object v = b == null ? null : b.get(k);
        return v == null ? null : Boolean.valueOf(v.toString());
    }

    @GetMapping("/api/admin/alerts")
    @Operation(summary = "Provider status, settings, today's counts and the latest 200 alerts (Principal / Admin)")
    public ResponseEntity<?> overview(Authentication a) {
        return run(a, alerts::overview);
    }

    @PostMapping("/api/admin/alerts/settings")
    public ResponseEntity<?> settings(Authentication a, @RequestBody Map<String, Object> b) {
        return run(a, p -> alerts.updateSettings(p, bool(b, "absenceAlerts"), bool(b, "feeReminders")));
    }

    @PostMapping("/api/admin/alerts/fee-reminders")
    @Operation(summary = "Queue a WhatsApp reminder to every family with an overdue fee (FINANCE; once a day per child)")
    public ResponseEntity<?> feeReminders(Authentication a) {
        return run(a, alerts::sendFeeReminders);
    }

    @GetMapping("/api/parent/alerts/preference")
    public ResponseEntity<?> preference(Authentication a) {
        return run(a, alerts::preference);
    }

    @PostMapping("/api/parent/alerts/preference")
    public ResponseEntity<?> setPreference(Authentication a, @RequestBody Map<String, Object> b) {
        Boolean on = bool(b, "whatsappAlerts");
        return run(a, p -> alerts.setPreference(p, on == null || on));
    }
}
