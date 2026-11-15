package com.futureschool.backend.parent;

import com.futureschool.backend.auth.AuthFlowException;
import com.futureschool.backend.auth.SignInService;
import com.futureschool.backend.entity.LoginSession;
import com.futureschool.backend.entity.UserAccount;
import com.futureschool.backend.entity.UserRole;
import com.futureschool.backend.office.TeacherPinService;
import com.futureschool.backend.repository.LoginSessionRepository;
import com.futureschool.backend.repository.UserAccountRepository;
import com.futureschool.backend.security.AccessPolicy;
import com.futureschool.backend.security.SchoolPrincipal;
import com.futureschool.backend.teaching.Teaching;
import io.swagger.v3.oas.annotations.Operation;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Parent sign-in PIN (required), on the account, so it is the same for every child and school.
 * The first PIN, or a new one after "Forgot PIN" (an SMS code), needs no second SMS; changing it
 * needs a fresh PIN_CHANGE OTP. Easy PINs are refused. Only a BCrypt hash is stored.
 */
@RestController
public class ParentPinController {

    private final UserAccountRepository accounts;
    private final LoginSessionRepository sessions;
    private final PasswordEncoder passwords;
    private final SignInService signIn;
    private final Teaching t;

    public ParentPinController(UserAccountRepository accounts, LoginSessionRepository sessions, PasswordEncoder passwords,
                               SignInService signIn, Teaching t) {
        this.accounts = accounts;
        this.sessions = sessions;
        this.passwords = passwords;
        this.signIn = signIn;
        this.t = t;
    }

    private static boolean resetting(SchoolPrincipal p) {
        String m = p.session().getMethods();
        return m != null && Arrays.asList(m.split(",")).contains("PIN_RESET");
    }

    private Map<String, Object> status(UserAccount a, boolean setupRequired) {
        Map<String, Object> v = new LinkedHashMap<>();
        v.put("setupRequired", setupRequired);
        v.put("pinSet", a.getPinHash() != null);
        v.put("locked", a.getPinHash() != null && a.getPinFailedAttempts() >= SignInService.PIN_MAX_FAILS);
        v.put("updatedAt", a.getPinUpdatedAt() == null ? null : a.getPinUpdatedAt().toEpochMilli());
        return v;
    }

    private ResponseEntity<?> error(AuthFlowException e) {
        Map<String, Object> err = new LinkedHashMap<>();
        err.put("success", false);
        err.put("error", e.getMessage());
        err.put("code", e.getCode());
        return ResponseEntity.status(e.getStatus()).body(err);
    }

    private UserAccount me(SchoolPrincipal p) {
        if (p.role() != UserRole.PARENT) throw Teaching.denied("This is for parents.");
        return accounts.findById(p.account().getId()).orElseThrow(() -> Teaching.denied("Your session has ended."));
    }

    @GetMapping("/api/parent/pin")
    @Operation(summary = "Parent: is the sign-in PIN set (never the PIN); setupRequired = show only the PIN screen")
    public ResponseEntity<?> status(Authentication auth) {
        try {
            SchoolPrincipal p = AccessPolicy.principal(auth);
            UserAccount a = me(p);
            return ResponseEntity.ok(status(a, a.getPinHash() == null || resetting(p)));
        } catch (AuthFlowException e) {
            return error(e);
        }
    }

    @PostMapping("/api/parent/pin")
    @Transactional
    @Operation(summary = "Parent: set the PIN (first time / after Forgot PIN: no extra SMS) or change it (fresh PIN_CHANGE OTP)")
    public ResponseEntity<?> set(Authentication auth, @RequestBody Map<String, String> b) {
        try {
            SchoolPrincipal p = AccessPolicy.principal(auth);
            UserAccount a = me(p);
            String pin = b == null ? null : b.get("pin");
            String weak = TeacherPinService.weakness(pin, a.getMobile());
            if (weak != null) throw Teaching.rule("WEAK_PIN", weak);
            boolean change = a.getPinHash() != null;
            boolean forgot = resetting(p);
            // A first PIN only from a session that started with an SMS code (never from a PIN-only device session).
            if (!change && !forgot && !TeacherPinService.smsSession(p)) {
                throw new AuthFlowException("OTP_REQUIRED", "Sign in with the SMS code to set your PIN.", null, 403);
            }
            if (change && !forgot && !signIn.consumeStepUp(b.get("stepUpToken"), "PIN_CHANGE", p.session())) {
                throw new AuthFlowException("STEP_UP_REQUIRED", "Please confirm with the OTP again.", null, 401);
            }
            a.setPinHash(passwords.encode(pin));
            a.setPinFailedAttempts(0);
            a.setPinUpdatedAt(Instant.now());
            accounts.save(a);
            if (forgot) {
                LoginSession s = sessions.findById(p.session().getId()).orElseThrow();
                s.setMethods(String.join(",", Arrays.stream(s.getMethods().split(",")).filter(x -> !x.equals("PIN_RESET")).toList()) + ",PIN");
                sessions.save(s);
            }
            t.record(p, forgot ? "PARENT_PIN_RESET_BY_SMS" : change ? "PARENT_PIN_CHANGED" : "PARENT_PIN_SET", a.getId(), a.getName(), null);
            return ResponseEntity.ok(status(a, false));
        } catch (AuthFlowException e) {
            return error(e);
        }
    }
}
