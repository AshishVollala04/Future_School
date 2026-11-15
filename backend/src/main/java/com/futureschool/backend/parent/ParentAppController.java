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

    @PostMapping("/fees/orders")
    @Operation(summary = "Create a payment order (mock or Razorpay) with server-computed amount and allocation")
    public ResponseEntity<?> createOrder(Authentication auth, @RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<Integer> ins = body.get("instalments") instanceof List<?> l ? (List<Integer>) l : null;
        Long amount = body.get("amount") instanceof Number n ? n.longValue() : null;
        String stepUpToken = body.get("stepUpToken") instanceof String s ? s : null;
        return run(auth, p -> data.createOrder(p, ins, amount, stepUpToken));
    }

    @PostMapping("/fees/orders/{orderId}/verify")
    @Operation(summary = "Verify Razorpay Checkout payment signature (HMAC-SHA256) and record payment")
    public ResponseEntity<?> verify(Authentication auth, @PathVariable String orderId, @RequestBody Map<String, String> body) {
        return run(auth, p -> data.verifyPayment(
                p,
                orderId,
                body.get("razorpayOrderId"),
                body.get("razorpayPaymentId"),
                body.get("razorpaySignature"),
                body.get("method"),
                body.get("stepUpToken")));
    }

    @PostMapping("/fees/orders/{orderId}/confirm-mock")
    @Operation(summary = "PROTOTYPE: mock provider confirmation. Requires a fresh PAYMENT step-up token")
    public ResponseEntity<?> confirm(Authentication auth, @PathVariable String orderId, @RequestBody Map<String, String> body) {
        return run(auth, p -> data.confirmMockPayment(p, orderId, body.get("method"), body.get("stepUpToken")));
    }

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
