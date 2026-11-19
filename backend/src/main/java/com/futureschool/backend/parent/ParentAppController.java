package com.futureschool.backend.parent;

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
 * Parent app data for the session's child. There is no studentId parameter anywhere:
 * the child always comes from the session (one school + one child).
 */
@RestController
@RequestMapping("/api/parent")
@Tag(name = "Parent app", description = "Fees, attendance, results and hall tickets for the session's child")
public class ParentAppController {

    private final ParentDataService data;

    public ParentAppController(ParentDataService data) {
        this.data = data;
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

    @GetMapping("/fees/summary")
    @Operation(summary = "Fee instalments, concessions, paid and outstanding (server-computed)")
    public ResponseEntity<?> feeSummary(Authentication auth) {
        return run(auth, data::feeSummary);
    }

    @GetMapping("/fees/payments")
    public ResponseEntity<?> payments(Authentication auth) {
        return run(auth, data::listPayments);
    }

    // Parents do not pay in the app: there are no payment-order, checkout or mock-payment endpoints.
    // Fees are collected at the school counter and recorded by finance staff (/api/office/fees/cash),
    // who issue the official receipt; parents see dues and receipts above.

    @GetMapping("/attendance")
    public ResponseEntity<?> attendance(Authentication auth, @RequestParam(defaultValue = "30") int days) {
        return run(auth, p -> data.attendance(p, days));
    }

    @GetMapping("/results")
    @Operation(summary = "Published results, CURRENT version first; superseded versions are kept")
    public ResponseEntity<?> results(Authentication auth) {
        return run(auth, data::results);
    }

    @GetMapping("/hall-tickets")
    @Operation(summary = "Upcoming exams: fee clearance + Class Teacher release (payment alone never releases)")
    public ResponseEntity<?> hallTickets(Authentication auth) {
        return run(auth, data::hallTickets);
    }
}
