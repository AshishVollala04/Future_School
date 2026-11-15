package com.futureschool.backend.bus;

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
import java.util.function.Supplier;

/** Live bus tracking: office links and status, the parent's live view, and the driver's link pages. */
@RestController
@Tag(name = "Bus tracking", description = "Live bus position from the driver's phone")
public class BusTrackingController {

    private final BusTrackingService bus;

    public BusTrackingController(BusTrackingService bus) {
        this.bus = bus;
    }

    private static ResponseEntity<?> error(AuthFlowException e) {
        Map<String, Object> err = new LinkedHashMap<>();
        err.put("success", false);
        err.put("error", e.getMessage());
        err.put("code", e.getCode());
        return ResponseEntity.status(e.getStatus()).body(err);
    }

    private ResponseEntity<?> run(Authentication auth, Function<SchoolPrincipal, Object> body) {
        try {
            return ResponseEntity.ok(body.apply(AccessPolicy.principal(auth)));
        } catch (AuthFlowException e) {
            return error(e);
        }
    }

    private ResponseEntity<?> open(Supplier<Object> body) {
        try {
            return ResponseEntity.ok(body.get());
        } catch (AuthFlowException e) {
            return error(e);
        }
    }

    private static Double d(Map<String, Object> b, String k) {
        Object v = b == null ? null : b.get(k);
        if (v instanceof Number n) return n.doubleValue();
        try {
            return v == null ? null : Double.parseDouble(v.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    // ---- office (Admin with TRANSPORT; the Principal may view)
    @GetMapping("/api/office/bus/live")
    public ResponseEntity<?> officeLive(Authentication a) {
        return run(a, bus::officeLive);
    }

    @PostMapping("/api/office/bus/routes/{routeId}/driver-link")
    @Operation(summary = "Make a new private driver link for a route (the old one stops working)")
    public ResponseEntity<?> createLink(Authentication a, @PathVariable String routeId) {
        return run(a, p -> bus.createLink(p, routeId));
    }

    @PostMapping("/api/office/bus/routes/{routeId}/driver-link/revoke")
    public ResponseEntity<?> revokeLink(Authentication a, @PathVariable String routeId) {
        return run(a, p -> bus.revokeLink(p, routeId));
    }

    // ---- parent
    @GetMapping("/api/parent/bus/live")
    public ResponseEntity<?> parentLive(Authentication a) {
        return run(a, bus::parentLive);
    }

    // ---- driver (no sign-in; the link's token is the key)
    @GetMapping("/api/public/bus/{token}")
    public ResponseEntity<?> driver(@PathVariable String token) {
        return open(() -> bus.driver(token));
    }

    @PostMapping("/api/public/bus/{token}/start")
    public ResponseEntity<?> start(@PathVariable String token, @RequestBody(required = false) Map<String, Object> b) {
        return open(() -> bus.start(token, b == null ? null : String.valueOf(b.get("direction"))));
    }

    @PostMapping("/api/public/bus/{token}/ping")
    public ResponseEntity<?> ping(@PathVariable String token, @RequestBody Map<String, Object> b) {
        return open(() -> bus.ping(token, d(b, "lat"), d(b, "lng"), d(b, "accuracy")));
    }

    @PostMapping("/api/public/bus/{token}/end")
    public ResponseEntity<?> end(@PathVariable String token) {
        return open(() -> bus.end(token));
    }

    @PostMapping("/api/public/bus/{token}/stops/{index}/here")
    public ResponseEntity<?> markStop(@PathVariable String token, @PathVariable int index, @RequestBody Map<String, Object> b) {
        return open(() -> bus.markStop(token, index, d(b, "lat"), d(b, "lng")));
    }
}
