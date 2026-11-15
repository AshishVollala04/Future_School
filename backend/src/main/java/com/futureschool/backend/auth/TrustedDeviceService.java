package com.futureschool.backend.auth;

import com.futureschool.backend.auth.AuthViews.SessionView;
import com.futureschool.backend.entity.LoginSession;
import com.futureschool.backend.entity.SchoolMembership;
import com.futureschool.backend.entity.TrustedDevice;
import com.futureschool.backend.entity.UserAccount;
import com.futureschool.backend.entity.UserRole;
import com.futureschool.backend.repository.SchoolMembershipRepository;
import com.futureschool.backend.repository.TrustedDeviceRepository;
import com.futureschool.backend.repository.UserAccountRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;

/**
 * Teacher and parent sign-in without an SMS every time (SMS costs money):
 * <ol>
 *   <li>First time on a device (or a new device, or "Forgot PIN"): mobile -> SMS code -> PIN. The
 *       app then asks the server to trust this device and keeps the device token.</li>
 *   <li>Next time on that device: the PIN only. No SMS. Teachers get a session
 *       ({@link #pinSignIn}); parents get their children and a ticket, then pick a child
 *       ({@link #parentPinSignIn}).</li>
 * </ol>
 * The device token alone opens nothing: the PIN is always needed. 5 wrong PINs lock it; the
 * teacher then uses "Forgot PIN" (SMS code) to set a new one. A trusted device expires after
 * 90 days (one SMS sign-in to renew). An Admin PIN reset revokes all of the teacher's devices.
 * Only a SHA-256 hash of the token is stored.
 */
@Service
public class TrustedDeviceService {

    static final Duration DEVICE_TTL = Duration.ofDays(90);
    static final int MAX_DEVICES = 5;

    private final SignInService signIn;
    private final TrustedDeviceRepository devices;
    private final UserAccountRepository accounts;
    private final SchoolMembershipRepository memberships;
    private final SecureRandom random = new SecureRandom();

    public TrustedDeviceService(SignInService signIn, TrustedDeviceRepository devices, UserAccountRepository accounts,
                                SchoolMembershipRepository memberships) {
        this.signIn = signIn;
        this.devices = devices;
        this.accounts = accounts;
        this.memberships = memberships;
    }

    /** Returned once. name and the masked mobile let the app greet the teacher on the PIN-only screen. */
    public record DeviceToken(String deviceToken, long expiresAt, String name, String mobile) {
    }

    static String hash(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static AuthFlowException unknownDevice() {
        return new AuthFlowException("DEVICE_UNKNOWN", "Please sign in with the SMS code on this device.", null, 401);
    }

    /**
     * Trust the device of this session. Only from a session opened with an SMS code (never from a
     * PIN-only session), and only once the teacher has a PIN. The token is returned once.
     */
    @Transactional
    public DeviceToken trust(UserAccount a, SchoolMembership m, LoginSession s, String label) {
        if (m.getRole() != UserRole.TEACHER && m.getRole() != UserRole.PARENT) {
            throw new AuthFlowException("FORBIDDEN", "Only teachers and parents sign in with a PIN.", null, 403);
        }
        List<String> methods = s.getMethods() == null ? List.of() : Arrays.asList(s.getMethods().split(","));
        if (!methods.contains("SMS_OTP")) throw new AuthFlowException("OTP_REQUIRED", "Sign in with the SMS code on this device first.", null, 403);
        String pinHash = m.getRole() == UserRole.TEACHER
                ? memberships.findById(m.getId()).orElse(m).getPinHash()
                : accounts.findById(a.getId()).orElse(a).getPinHash();
        if (pinHash == null || methods.contains("PIN_RESET")) {
            throw new AuthFlowException("PIN_SETUP_REQUIRED", "Set your 4-digit sign-in PIN first.", null, 403);
        }
        byte[] b = new byte[32];
        random.nextBytes(b);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(b);
        Instant now = Instant.now();
        byte[] id = new byte[9];
        random.nextBytes(id);
        devices.save(TrustedDevice.builder().id("TDV-" + Base64.getUrlEncoder().withoutPadding().encodeToString(id))
                .tokenHash(hash(token)).accountId(a.getId()).membershipId(m.getId()).kind(m.getRole().name())
                .label(label == null ? null : label.substring(0, Math.min(120, label.length())))
                .createdAt(now).expiresAt(now.plus(DEVICE_TTL)).revoked(false).build());
        // Keep only the newest few devices.
        devices.findByAccountIdAndRevokedFalseOrderByCreatedAtDesc(a.getId()).stream().skip(MAX_DEVICES).forEach(d -> {
            d.setRevoked(true);
            devices.save(d);
        });
        String mob = a.getMobile() == null || a.getMobile().length() < 4 ? "" : "••••••" + a.getMobile().substring(a.getMobile().length() - 4);
        return new DeviceToken(token, now.plus(DEVICE_TTL).toEpochMilli(), a.getName(), mob);
    }

    private TrustedDevice device(String deviceToken, String kind) {
        TrustedDevice d = deviceToken == null || deviceToken.isBlank() ? null : devices.findByTokenHash(hash(deviceToken)).orElse(null);
        if (d == null || d.isRevoked() || Instant.now().isAfter(d.getExpiresAt()) || !kind.equals(d.getKind())) throw unknownDevice();
        return d;
    }

    /** Teacher: PIN-only sign-in on a trusted device. Wrong PINs count towards the same 5-try lock. */
    @Transactional(noRollbackFor = AuthFlowException.class)
    public SessionView pinSignIn(String deviceToken, String pin) {
        TrustedDevice d = device(deviceToken, "TEACHER");
        UserAccount a = accounts.findById(d.getAccountId())
                .filter(x -> x.isActive() && !"Inactive".equalsIgnoreCase(x.getStatus())).orElseThrow(TrustedDeviceService::unknownDevice);
        SchoolMembership m = memberships.findByIdAndAccountId(d.getMembershipId(), a.getId())
                .filter(x -> x.isActive() && x.getRole() == UserRole.TEACHER)
                .orElseThrow(() -> new AuthFlowException("NOT_LINKED", "This account has no active school access.", null, 403));
        if (m.getPinHash() == null) throw new AuthFlowException("PIN_NOT_SET", "Your PIN was reset. Sign in with the SMS code to set a new one.", null, 401);
        signIn.checkPin(m, pin);
        d.setLastUsedAt(Instant.now());
        devices.save(d);
        return signIn.openSession(a, m, null, "DEVICE,PIN", "SMS:" + a.getMobile(), List.of());
    }

    /**
     * Parent: PIN-only sign-in on a trusted device. The PIN is on the account (all schools).
     * Returns the children and a DEVICE,PIN ticket; parent/session then needs no PIN.
     */
    @Transactional(noRollbackFor = AuthFlowException.class)
    public AuthViews.ParentVerification parentPinSignIn(String deviceToken, String pin) {
        TrustedDevice d = device(deviceToken, "PARENT");
        UserAccount a = accounts.findById(d.getAccountId())
                .filter(x -> x.isActive() && !"Inactive".equalsIgnoreCase(x.getStatus())).orElseThrow(TrustedDeviceService::unknownDevice);
        if (a.getPinHash() == null) throw new AuthFlowException("PIN_NOT_SET", "Your PIN was reset. Sign in with the SMS code to set a new one.", null, 401);
        signIn.checkPin(a, pin);
        d.setLastUsedAt(Instant.now());
        devices.save(d);
        return signIn.parentVerification(a, "DEVICE,PIN");
    }

    /** "Not you? / Use another number": the device stops being trusted. The token proves ownership. */
    @Transactional
    public void forget(String deviceToken) {
        if (deviceToken == null || deviceToken.isBlank()) return;
        devices.findByTokenHash(hash(deviceToken)).ifPresent(d -> {
            d.setRevoked(true);
            devices.save(d);
        });
    }

    /** Admin PIN reset: every device of this kind (TEACHER or PARENT) must sign in with an SMS code again. */
    @Transactional
    public void revokeAll(String accountId, String kind) {
        devices.findByAccountIdAndRevokedFalseOrderByCreatedAtDesc(accountId).stream().filter(d -> kind.equals(d.getKind())).forEach(d -> {
            d.setRevoked(true);
            devices.save(d);
        });
    }
}
