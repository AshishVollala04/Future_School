package com.futureschool.backend.parent;

import com.futureschool.backend.auth.AuthFlowException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Public server-to-server webhook for Razorpay events (e.g. payment.captured).
 * Authenticated strictly by HMAC-SHA256 signature verification against X-Razorpay-Signature.
 */
@RestController
@RequestMapping("/api/payments/razorpay")
@Tag(name = "Payments Webhook", description = "Razorpay server-to-server webhook")
public class RazorpayWebhookController {

    private final ParentDataService data;

    public RazorpayWebhookController(ParentDataService data) {
        this.data = data;
    }

    @PostMapping("/webhook")
    @Operation(summary = "Receive and verify signed Razorpay payment webhook")
    public ResponseEntity<?> webhook(@RequestBody(required = false) byte[] rawBody,
                                     @RequestHeader(value = "X-Razorpay-Signature", required = false) String signature) {
        try {
            return ResponseEntity.ok(data.handleRazorpayWebhook(rawBody, signature));
        } catch (AuthFlowException e) {
            Map<String, Object> err = new LinkedHashMap<>();
            err.put("success", false);
            err.put("error", e.getMessage());
            err.put("code", e.getCode());
            return ResponseEntity.status(e.getStatus()).body(err);
        }
    }
}
