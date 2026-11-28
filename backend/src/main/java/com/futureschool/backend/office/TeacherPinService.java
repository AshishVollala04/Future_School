package com.futureschool.backend.office;

import com.futureschool.backend.auth.AuthFlowException;
import com.futureschool.backend.auth.SignInService;
import com.futureschool.backend.entity.SchoolMembership;
import com.futureschool.backend.entity.UserAccount;
import com.futureschool.backend.entity.UserRole;
import com.futureschool.backend.governance.GovernanceService;
import com.futureschool.backend.repository.SchoolMembershipRepository;
import com.futureschool.backend.repository.UserAccountRepository;
import com.futureschool.backend.security.SchoolPrincipal;
import com.futureschool.backend.teaching.Teaching;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Teacher sign-in PIN: REQUIRED, 4 digits, asked after the SMS OTP (see SignInService).
 * <ul>
 *   <li>A teacher without a PIN must set one right after signing in; until then every other
 *       request is refused (JwtAuthenticationFilter, PIN_SETUP_REQUIRED). The first PIN needs no
 *       second OTP (the session was opened with one seconds ago). Changing it needs a fresh SMS
 *       OTP (SENSITIVE_STAFF_ACTION). It cannot be removed. Easy-to-guess PINs are refused.</li>
 *   <li>5 wrong PINs lock it. An Admin with SECURITY resets it (reason + OTP), which clears it:
 *       the teacher signs in with the OTP and must set a new one.</li>
 *   <li>Only a BCrypt hash is stored. The PIN is never returned, logged or audited.</li>
 * </ul>
 */
@Service
public class TeacherPinService {

    private final SchoolMembershipRepository memberships;
    private final UserAccountRepository accounts;
    private final PasswordEncoder passwords;
    private final SignInService signIn;
    private final Teaching t;
    private final com.futureschool.backend.auth.TrustedDeviceService devices;
    private final com.futureschool.backend.repository.LoginSessionRepository sessions;
    private com.futureschool.backend.security.AuthSessionCache sessionCache;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    public void setSessionCache(com.futureschool.backend.security.AuthSessionCache sessionCache) {
        this.sessionCache = sessionCache;
    }

    public TeacherPinService(SchoolMembershipRepository memberships, UserAccountRepository accounts, PasswordEncoder passwords,
                             SignInService signIn, Teaching t, com.futureschool.backend.auth.TrustedDeviceService devices,
                             com.futureschool.backend.repository.LoginSessionRepository sessions) {
        this.devices = devices;
        this.sessions = sessions;
        this.memberships = memberships;
        this.accounts = accounts;
        this.passwords = passwords;
        this.signIn = signIn;
        this.t = t;
    }

    // ------------------------------------------------------------------ teacher

    private SchoolMembership mine(SchoolPrincipal p) {
        if (p.role() != UserRole.TEACHER) throw Teaching.denied("Only teachers have a sign-in PIN.");
        return memberships.findById(p.membership().getId()).orElseThrow(() -> Teaching.denied("Your session has ended."));
    }

    private static Map<String, Object> status(SchoolMembership m) {
        Map<String, Object> v = new LinkedHashMap<>();
        v.put("pinSet", m.getPinHash() != null);
        v.put("locked", m.getPinHash() != null && m.getPinFailedAttempts() >= SignInService.PIN_MAX_FAILS);
        v.put("updatedAt", m.getPinUpdatedAt() == null ? null : m.getPinUpdatedAt().toEpochMilli());
        return v;
    }

    public static boolean smsSession(SchoolPrincipal p) {
        String m = p.session().getMethods();
        return m != null && java.util.Arrays.asList(m.split(",")).contains("SMS_OTP");
    }

    private static boolean resetting(SchoolPrincipal p) {
        String m = p.session().getMethods();
        return m != null && java.util.Arrays.asList(m.split(",")).contains("PIN_RESET");
    }

    /** setupRequired: no PIN yet, or a "Forgot PIN" session; the app then shows only the PIN screen. */
    public Map<String, Object> myStatus(SchoolPrincipal p) {
        SchoolMembership m = mine(p);
        Map<String, Object> v = status(m);
        v.put("setupRequired", m.getPinHash() == null || resetting(p));
        return v;
    }

    /** Easy-to-guess PINs are refused: 1111, 1234, 4321, and the first or last 4 digits of the mobile. */
    public static String weakness(String pin, String mobile) {
        if (pin == null || !pin.matches("\\d{4}")) return "Enter exactly 4 digits.";
        if (pin.chars().distinct().count() == 1) return "Do not use the same digit four times.";
        boolean up = true, down = true;
        for (int i = 1; i < 4; i++) {
            int d = pin.charAt(i) - pin.charAt(i - 1);
            up &= d == 1;
            down &= d == -1;
        }
        if (up || down) return "Do not use digits in a row (like 1234 or 4321).";
        if (mobile != null && mobile.length() >= 4 && (mobile.endsWith(pin) || mobile.startsWith(pin))) {
            return "Do not use part of your mobile number.";
        }
        return null;
    }

    @Transactional
    public Map<String, Object> setMine(SchoolPrincipal p, String pin, String stepUpToken) {
        SchoolMembership m = mine(p);
        String weak = weakness(pin, p.account().getMobile());
        if (weak != null) throw Teaching.rule("WEAK_PIN", weak);
        boolean change = m.getPinHash() != null;
        boolean forgot = resetting(p);
        // First PIN, or "Forgot PIN": the session was opened with an SMS code moments ago. A normal change needs a fresh one.
        if (change && !forgot) requireStepUp(p, stepUpToken);
        // A first PIN only from a session that started with an SMS code (never from a PIN-only device session).
        if (!change && !forgot && !smsSession(p)) {
            throw new AuthFlowException("OTP_REQUIRED", "Sign in with the SMS code to set your PIN.", null, 403);
        }
        m.setPinHash(passwords.encode(pin));
        m.setPinFailedAttempts(0);
        m.setPinUpdatedAt(Instant.now());
        memberships.save(m);
        if (forgot) {
            com.futureschool.backend.entity.LoginSession s = sessions.findById(p.session().getId()).orElseThrow();
            s.setMethods(String.join(",", java.util.Arrays.stream(s.getMethods().split(",")).filter(x -> !x.equals("PIN_RESET")).toList()) + ",PIN");
            sessions.save(s);
        }
        if (sessionCache != null) sessionCache.evictMembership(m.getId());
        t.record(p, forgot ? "TEACHER_PIN_RESET_BY_SMS" : change ? "TEACHER_PIN_CHANGED" : "TEACHER_PIN_SET", m.getId(), p.account().getName(), null);
        Map<String, Object> v = status(m);
        v.put("setupRequired", false);
        return v;
    }

    // ------------------------------------------------------------------ admin

    /** Teachers of MY school and whether each has a PIN (never the PIN). Admin with SECURITY. */
    public List<Map<String, Object>> list(SchoolPrincipal p) {
        GovernanceService.requirePermission(p, "SECURITY");
        return memberships.findBySchoolIdAndRole(t.school(), UserRole.TEACHER).stream()
                .map(m -> {
                    UserAccount a = accounts.findById(m.getAccountId()).orElse(null);
                    if (a == null) return null;
                    Map<String, Object> v = status(m);
                    v.put("membershipId", m.getId());
                    v.put("name", a.getName());
                    v.put("title", m.getTitle() == null ? "Teacher" : m.getTitle());
                    v.put("active", m.isActive() && a.isActive());
                    v.put("mobile", masked(a.getMobile()));
                    return v;
                })
                .filter(java.util.Objects::nonNull)
                .sorted(Comparator.comparing(v -> String.valueOf(v.get("name"))))
                .toList();
    }

    /** Reset = clear the PIN (also unlocks); the teacher must set a new one at the next sign-in. Reason + fresh OTP. Audited. */
    @Transactional(noRollbackFor = AuthFlowException.class)
    public Map<String, Object> reset(SchoolPrincipal p, String membershipId, String reason, String stepUpToken) {
        GovernanceService.requirePermission(p, "SECURITY");
        SchoolMembership m = memberships.findBySchoolIdAndRole(t.school(), UserRole.TEACHER).stream()
                .filter(x -> x.getId().equals(membershipId)).findFirst()
                .orElseThrow(() -> Teaching.denied("Teacher not found in this school."));
        String r = reason == null ? "" : reason.trim();
        if (r.length() < 10) throw Teaching.rule("REASON", "Give a reason (10+ characters).");
        if (m.getPinHash() == null) throw Teaching.rule("STATE", "This teacher has no PIN.");
        requireStepUp(p, stepUpToken);
        clear(m);
        // Lock out anyone already signed in (e.g. the reason for the reset): end every open session and
        // the teacher's trusted devices. The teacher signs in again with an SMS code and sets a new PIN.
        devices.revokeAll(m.getAccountId(), "TEACHER");
        sessions.findByMembershipIdAndRevokedFalse(m.getId()).forEach(s -> {
            s.setRevoked(true);
            sessions.save(s);
        });
        if (sessionCache != null) sessionCache.evictMembership(m.getId());
        String name = accounts.findById(m.getAccountId()).map(UserAccount::getName).orElse(m.getAccountId());
        t.record(p, "TEACHER_PIN_RESET", m.getId(), name, r);
        return status(m);
    }

    // ------------------------------------------------------------------ helpers

    private void requireStepUp(SchoolPrincipal p, String token) {
        if (!signIn.consumeStepUp(token, "SENSITIVE_STAFF_ACTION", p.session())) {
            throw new AuthFlowException("STEP_UP_REQUIRED", "Please confirm with the OTP again.", null, 401);
        }
    }

    private void clear(SchoolMembership m) {
        m.setPinHash(null);
        m.setPinFailedAttempts(0);
        m.setPinUpdatedAt(Instant.now());
        memberships.save(m);
    }

    private static String masked(String mobile) {
        return mobile == null || mobile.length() < 4 ? "" : "••••••" + mobile.substring(mobile.length() - 4);
    }
}
