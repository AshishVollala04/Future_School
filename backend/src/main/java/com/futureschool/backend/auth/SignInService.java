package com.futureschool.backend.auth;

import com.futureschool.backend.auth.AuthViews.*;
import com.futureschool.backend.entity.*;
import com.futureschool.backend.repository.*;
import com.futureschool.backend.security.JwtUtil;
import com.futureschool.backend.tenant.TenantContext;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Sign-in flows (same model as the frontend):
 *
 *  Parent   mobile -> SMS OTP -> choose child -> session (one school + one child)
 *  Teacher  mobile -> SMS OTP -> choose school -> session
 *  Principal/Admin  school email + password -> EMAIL OTP -> choose school/role -> session
 *
 * Every step hands out a single-use ticket that grants no data access. Sessions are stored
 * server-side, so logout and suspension take effect immediately.
 */
@Service
public class SignInService {

    private static final Duration TICKET_TTL = Duration.ofMinutes(10);
    private static final Duration STEP_UP_TTL = Duration.ofMinutes(2);
    private static final Map<UserRole, Duration> SESSION_TTL = Map.of(
            UserRole.PARENT, Duration.ofDays(30),
            UserRole.TEACHER, Duration.ofDays(7),
            UserRole.PRINCIPAL, Duration.ofHours(12),
            UserRole.ADMIN, Duration.ofHours(12),
            UserRole.STUDENT, Duration.ofHours(12));
    private static final Set<String> STEP_UP_PURPOSES = Set.of("PAYMENT", "PICKUP_AUTHORIZATION", "SENSITIVE_STAFF_ACTION", "PIN_CHANGE");
    private static final String GENERIC_STAFF_DENIAL = "We could not sign you in with those details.";
    private static final int PASSWORD_MAX_FAILS = 5;
    private static final Duration PASSWORD_LOCK = Duration.ofMinutes(15);

    private final OtpService otp;
    private final UserAccountRepository accounts;
    private final SchoolMembershipRepository memberships;
    private final SchoolRepository schools;
    private final StudentRepository students;
    private final AuthTicketRepository tickets;
    private final LoginSessionRepository sessions;
    private final StaffInvitationRepository invitations;
    private final com.futureschool.backend.repository.IdentityLinkRepository identityLinks;
    private final JwtUtil jwt;
    private final PasswordEncoder passwords;
    /** Fresh read-only transaction, so each school is read with its own school filter. */
    private final TransactionTemplate perSchoolRead;
    private final SecureRandom random = new SecureRandom();
    /** Prototype store. Production: shared store so lockout works across instances. */
    private final Map<String, long[]> passwordFails = new ConcurrentHashMap<>();
    private com.futureschool.backend.security.AuthSessionCache sessionCache;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    public void setSessionCache(com.futureschool.backend.security.AuthSessionCache sessionCache) {
        this.sessionCache = sessionCache;
    }

    public SignInService(OtpService otp, UserAccountRepository accounts, SchoolMembershipRepository memberships, SchoolRepository schools,
                         StudentRepository students, AuthTicketRepository tickets, LoginSessionRepository sessions, JwtUtil jwt,
                         PasswordEncoder passwords, PlatformTransactionManager txm,
                         StaffInvitationRepository invitations, com.futureschool.backend.repository.IdentityLinkRepository identityLinks) {
        this.invitations = invitations;
        this.identityLinks = identityLinks;
        this.otp = otp;
        this.accounts = accounts;
        this.memberships = memberships;
        this.schools = schools;
        this.students = students;
        this.tickets = tickets;
        this.sessions = sessions;
        this.jwt = jwt;
        this.passwords = passwords;
        this.perSchoolRead = new TransactionTemplate(txm);
        this.perSchoolRead.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.perSchoolRead.setReadOnly(true);
    }

    // ================================================================== mobile OTP

    public static String cleanMobile(String raw) {
        if (raw == null) return null;
        String d = raw.replaceAll("[^0-9]", "");
        if (d.length() == 12 && d.startsWith("91")) d = d.substring(2);
        if (d.length() == 11 && d.startsWith("0")) d = d.substring(1);
        return d.matches("[6-9][0-9]{9}") ? d : null;
    }

    /** Never reveals whether the number is registered: a challenge is always issued. */
    public OtpService.ChallengeView requestMobileOtp(String mobile, String purpose) {
        if (!"PARENT_LOGIN".equals(purpose) && !"TEACHER_LOGIN".equals(purpose)) throw new AuthFlowException("BAD_PURPOSE", "Unknown sign-in type.", null, 400);
        String m = cleanMobile(mobile);
        if (m == null) throw new AuthFlowException("BAD_MOBILE", "Enter a valid 10-digit Indian mobile number.", null, 400);
        return otp.issue("SMS", m, purpose, null);
    }

    public OtpService.ChallengeView resend(String challengeId) {
        return otp.resend(challengeId);
    }

    // ================================================================== parent

    @Transactional
    public ParentVerification verifyParent(String challengeId, String code) {
        OtpChallenge c = otp.verify(challengeId, code, "PARENT_LOGIN", null);
        UserAccount guardian = activeAccountsByMobile(c.getDestination()).stream()
                .filter(a -> !activeMemberships(a, UserRole.PARENT).isEmpty())
                .findFirst().orElse(null);
        List<ChildView> kids = guardian == null ? List.of() : children(guardian);
        if (kids.isEmpty()) {
            throw new AuthFlowException("NO_LINKS", "No students are linked to this mobile number. Please contact your school office to register it.");
        }
        return new ParentVerification(newTicket("PARENT", guardian.getId(), "SMS_OTP"), guardian.getName(), kids, guardian.getPinHash() != null);
    }

    /** After a PIN-only sign-in on a trusted device: the same children list, with a DEVICE,PIN ticket. */
    ParentVerification parentVerification(UserAccount guardian, String methods) {
        List<ChildView> kids = children(guardian);
        if (kids.isEmpty()) {
            throw new AuthFlowException("NO_LINKS", "No students are linked to this mobile number. Please contact your school office to register it.");
        }
        return new ParentVerification(newTicket("PARENT", guardian.getId(), methods), guardian.getName(), kids, false);
    }

    /**
     * Parent picks a child. Same PIN rules as teachers, on the account: after an SMS code a set PIN
     * is asked (PIN_REQUIRED / PIN_INVALID keep the ticket); forgotPin opens a PIN_RESET session
     * that can only set a new PIN; after a PIN-only sign-in (ticket DEVICE,PIN) nothing more is asked.
     */
    @Transactional(noRollbackFor = AuthFlowException.class)
    public SessionView startParentSession(String ticket, String studentId, String pin, boolean forgotPin) {
        AuthTicket t = peekTicket(ticket, "PARENT");
        UserAccount guardian = accounts.findById(t.getAccountId()).orElseThrow(this::expired);
        // The child first: "not your child" is answered before any PIN is checked.
        children(guardian).stream().filter(k -> k.id().equals(studentId)).findFirst()
                .orElseThrow(() -> new AuthFlowException("NOT_LINKED", "This student is not linked to your mobile number."));
        String methods = t.getMethods();
        boolean pinDone = java.util.Arrays.asList(methods.split(",")).contains("PIN");
        if (guardian.getPinHash() != null && !pinDone) {
            if (forgotPin) {
                methods = methods + ",PIN_RESET";
            } else {
                checkPin(guardian, pin);
                methods = methods + ",PIN";
            }
        }
        takeTicket(ticket, "PARENT");
        return parentSession(guardian, studentId, methods, "SMS:" + guardian.getMobile());
    }

    private SessionView parentSession(UserAccount guardian, String studentId, String methods, String contact) {
        ChildView child = children(guardian).stream().filter(k -> k.id().equals(studentId)).findFirst()
                .orElseThrow(() -> new AuthFlowException("NOT_LINKED", "This student is not linked to your mobile number."));
        SchoolMembership m = activeMemberships(guardian, UserRole.PARENT).stream().filter(x -> x.getSchoolId().equals(child.schoolId())).findFirst()
                .orElseThrow(() -> new AuthFlowException("NOT_LINKED", "This student is not linked to your mobile number."));
        return openSession(guardian, m, child.id(), methods, contact, children(guardian));
    }

    /** Children linked to the guardian, read school by school (each read is school-filtered). */
    private List<ChildView> children(UserAccount guardian) {
        List<String> linked = guardian.getLinkedStudentIds() == null ? List.of() : guardian.getLinkedStudentIds();
        if (linked.isEmpty()) return List.of();
        List<ChildView> out = new ArrayList<>();
        for (SchoolMembership m : activeMemberships(guardian, UserRole.PARENT)) {
            School school = schools.findById(m.getSchoolId()).orElse(null);
            if (school == null) continue;
            TenantContext.runAs(school.getId(), () -> perSchoolRead.executeWithoutResult(tx -> students.findAllById(linked).stream()
                    .filter(s -> !"Exited".equalsIgnoreCase(s.getStatus()) && !"Transferred".equalsIgnoreCase(s.getStatus()))
                    .forEach(s -> out.add(childView(s, school)))));
        }
        out.sort(Comparator.comparing(ChildView::name));
        return out;
    }

    private ChildView childView(Student s, School school) {
        String grade = s.getClassName() == null ? "" : s.getClassName().replaceAll("[^0-9]", "");
        return new ChildView(s.getId(), s.getName(), grade, s.getSection(), s.getRoll(), school.getId(), school.getName(),
                boardLabel(school.getBoard()), avatar(s.getName(), "e0f2fe"));
    }

    // ================================================================== teacher

    @Transactional
    public StaffVerification verifyTeacher(String challengeId, String code) {
        OtpChallenge c = otp.verify(challengeId, code, "TEACHER_LOGIN", null);
        UserAccount teacher = activeAccountsByMobile(c.getDestination()).stream()
                .filter(a -> !activeMemberships(a, UserRole.TEACHER).isEmpty())
                .findFirst()
                .orElseThrow(() -> new AuthFlowException("NOT_LINKED", "This number is not registered as school staff. Please contact your school office."));
        return new StaffVerification(newTicket("TEACHER", teacher.getId(), "SMS_OTP"), teacher.getName(), options(teacher, Set.of(UserRole.TEACHER)));
    }

    public static final int PIN_MAX_FAILS = 5;

    /**
     * After the SMS OTP (first time on a device, a new device, or "Forgot PIN").
     * <ul>
     *   <li>No PIN yet: the session opens, but only the PIN can be set (JwtAuthenticationFilter).</li>
     *   <li>PIN set: it is asked (PIN_REQUIRED / PIN_INVALID keep the ticket so the teacher can retype).</li>
     *   <li>forgotPin: no PIN check; the session is marked PIN_RESET and can only set a new PIN.
     *       The SMS code proves the phone, so this also unlocks a locked PIN.</li>
     * </ul>
     * Wrong PINs are counted on the membership (kept even though an error is thrown).
     */
    @Transactional(noRollbackFor = AuthFlowException.class)
    public SessionView startTeacherSession(String ticket, String membershipId, String pin, boolean forgotPin) {
        AuthTicket t = peekTicket(ticket, "TEACHER");
        UserAccount teacher = accounts.findById(t.getAccountId()).orElseThrow(this::expired);
        SchoolMembership m = pickMembership(teacher, membershipId, Set.of(UserRole.TEACHER));
        String methods = t.getMethods();
        if (m.getPinHash() != null) {
            if (forgotPin) {
                methods = methods + ",PIN_RESET";
            } else {
                checkPin(m, pin);
                methods = methods + ",PIN";
            }
        }
        takeTicket(ticket, "TEACHER");
        return openSession(teacher, m, null, methods, "SMS:" + teacher.getMobile(), List.of());
    }

    /**
     * Shared by SMS sign-in and PIN-only sign-in, for teachers (membership) and parents (account).
     * Throws on a missing, wrong or locked PIN.
     * <p>
     * Each guess first takes one of the 5 tries with an atomic, guarded UPDATE, before the PIN is
     * compared. Parallel guesses therefore cannot share a try (no lost update): at most 5 guesses
     * are ever compared until a right PIN, or "Forgot PIN", clears the count. Must run inside the
     * caller's transaction (noRollbackFor AuthFlowException keeps the used try).
     */
    void checkPin(com.futureschool.backend.entity.PinHolder h, String pin) {
        boolean teacher = h instanceof SchoolMembership;
        if (pin == null || pin.isBlank()) {
            if (h.getPinFailedAttempts() >= PIN_MAX_FAILS) throw pinLocked();
            throw new AuthFlowException("PIN_REQUIRED", "Enter your 4-digit PIN.", null, 401);
        }
        int reserved = teacher ? memberships.reservePinTry(h.getId(), PIN_MAX_FAILS) : accounts.reservePinTry(h.getId(), PIN_MAX_FAILS);
        if (reserved == 0) throw pinLocked();
        if (pin.matches("\\d{4}") && passwords.matches(pin, h.getPinHash())) {
            if (teacher) memberships.clearPinTries(h.getId());
            else accounts.clearPinTries(h.getId());
            return;
        }
        int used = teacher ? memberships.pinTriesUsed(h.getId()) : accounts.pinTriesUsed(h.getId());
        int left = PIN_MAX_FAILS - used;
        if (left <= 0) throw pinLocked();
        throw new AuthFlowException("PIN_INVALID", "Incorrect PIN. " + left + " attempt(s) left.", left, 401);
    }

    private static AuthFlowException pinLocked() {
        return new AuthFlowException("PIN_LOCKED", "PIN locked after 5 wrong tries. Tap 'Forgot PIN' to get an SMS code and set a new one.", 0, 423);
    }

    // ================================================================== principal / admin

    // ================================================================== invitations

    public record InvitationView(String token, String email, String role, String schoolId, String schoolName, long expiresAt) {
    }

    private StaffInvitation validInvite(String token, String email) {
        StaffInvitation i = token == null ? null : invitations.findById(token).orElse(null);
        if (i == null || i.getUsedAt() != null || Instant.now().isAfter(i.getExpiresAt())) return null;
        if (email != null && !i.getEmail().equalsIgnoreCase(email.trim())) return null;
        return i;
    }

    public InvitationView getInvitation(String token) {
        StaffInvitation i = validInvite(token, null);
        if (i == null) throw new AuthFlowException("INVITE_INVALID", "This invitation link is invalid, expired or already used. Ask your Admin for a new one.");
        return new InvitationView(i.getToken(), i.getEmail(), i.getRole(), i.getSchoolId(),
                schools.findById(i.getSchoolId()).map(School::getName).orElse(i.getSchoolId()), i.getExpiresAt().toEpochMilli());
    }

    /** Accepting an invitation: choose a password, then confirm an email OTP. Applied only after both. */
    @Transactional
    public StaffFirstFactor acceptInvitation(String token, String email, String password) {
        StaffInvitation i = validInvite(token, email);
        if (i == null) throw new AuthFlowException("INVITE_INVALID", "This invitation is invalid, expired, or for a different email.");
        if (password == null || password.length() < 10 || !password.matches(".*[A-Za-z].*") || !password.matches(".*\\d.*")) {
            throw new AuthFlowException("WEAK_PASSWORD", "Choose a password of at least 10 characters with letters and numbers.", null, 400);
        }
        String id = "TKT-" + randomId();
        tickets.save(AuthTicket.builder().id(id).kind("STAFF_FIRST_FACTOR").accountId(i.getAccountId()).methods("PASSWORD")
                .expiresAt(Instant.now().plus(TICKET_TTL)).used(false).pendingPasswordHash(passwords.encode(password)).inviteToken(i.getToken()).build());
        return new StaffFirstFactor(id, otp.issue("EMAIL", i.getEmail().toLowerCase(), "STAFF_SECOND_FACTOR", id));
    }

    @Transactional
    public StaffFirstFactor staffPassword(String email, String password) {
        String key = email == null ? "" : email.trim().toLowerCase();
        long[] f = passwordFails.get(key);
        if (f != null && f[1] > System.currentTimeMillis()) {
            throw new AuthFlowException("LOCKED", "Too many failed attempts. Try again in 15 minutes.", null, 429);
        }
        UserAccount a = accounts.findByEmailIgnoreCase(key).orElse(null);
        boolean ok = a != null && a.isActive() && password != null && passwords.matches(password, a.getPassword())
                && !activeMemberships(a, UserRole.ADMIN, UserRole.PRINCIPAL).isEmpty();
        if (!ok) {
            long[] next = passwordFails.merge(key, new long[]{1, 0}, (x, y) -> new long[]{x[0] + 1, 0});
            if (next[0] >= PASSWORD_MAX_FAILS) next[1] = System.currentTimeMillis() + PASSWORD_LOCK.toMillis();
            throw new AuthFlowException("DENIED", GENERIC_STAFF_DENIAL);
        }
        passwordFails.remove(key);
        String ticket = newTicket("STAFF_FIRST_FACTOR", a.getId(), "PASSWORD");
        // Always a second factor for leadership accounts.
        return new StaffFirstFactor(ticket, otp.issue("EMAIL", a.getEmail().toLowerCase(), "STAFF_SECOND_FACTOR", ticket));
    }

    @Transactional
    public StaffVerification staffSecondFactor(String ticket, String challengeId, String code) {
        AuthTicket t = peekTicket(ticket, "STAFF_FIRST_FACTOR");
        otp.verify(challengeId, code, "STAFF_SECOND_FACTOR", t.getId());
        t.setUsed(true);
        tickets.save(t);
        UserAccount a = accounts.findById(t.getAccountId()).orElseThrow(this::expired);
        if (t.getInviteToken() != null) {
            // Both factors passed: now (and only now) the invitation takes effect.
            StaffInvitation i = validInvite(t.getInviteToken(), a.getEmail());
            if (i == null) throw new AuthFlowException("INVITE_INVALID", "This invitation is no longer valid.");
            // An invitation accepted with Microsoft/Google sets no password (the account keeps its unusable one).
            if (t.getPendingPasswordHash() != null) a.setPassword(t.getPendingPasswordHash());
            a.setActive(true);
            a.setStatus("Active");
            accounts.save(a);
            memberships.findById(i.getMembershipId()).ifPresent(m -> {
                m.setActive(true);
                memberships.save(m);
            });
            i.setUsedAt(Instant.now());
            invitations.save(i);
        }
        if (t.getPendingIdpProvider() != null) {
            // Microsoft/Google passed and the school mailbox confirmed the email code: link the identity now.
            var existing = identityLinks.findByProviderAndSubject(t.getPendingIdpProvider(), t.getPendingIdpSubject()).orElse(null);
            if (existing != null && !existing.getAccountId().equals(a.getId())) {
                throw new AuthFlowException("IDP_LINKED_ELSEWHERE", "This Microsoft/Google account is already linked to another FutureSchool account.", null, 409);
            }
            if (existing == null) {
                identityLinks.save(com.futureschool.backend.entity.IdentityLink.builder().id("IDL-" + randomId().substring(0, 20))
                        .provider(t.getPendingIdpProvider()).subject(t.getPendingIdpSubject()).accountId(a.getId())
                        .email(t.getPendingIdpEmail()).createdAt(Instant.now()).build());
            }
        }
        return new StaffVerification(newTicket("STAFF_VERIFIED", a.getId(), t.getMethods() + ",EMAIL_OTP"), a.getName(),
                options(a, Set.of(UserRole.ADMIN, UserRole.PRINCIPAL)));
    }

    @Transactional
    public SessionView startStaffSession(String ticket, String membershipId) {
        AuthTicket t = takeTicket(ticket, "STAFF_VERIFIED");
        UserAccount a = accounts.findById(t.getAccountId()).orElseThrow(this::expired);
        SchoolMembership m = pickMembership(a, membershipId, Set.of(UserRole.ADMIN, UserRole.PRINCIPAL));
        return openSession(a, m, null, t.getMethods(), "EMAIL:" + a.getEmail().toLowerCase(), List.of());
    }

    // ================================================================== session operations

    @Transactional
    public SessionView switchChild(LoginSession current, String studentId) {
        UserAccount guardian = accounts.findById(current.getAccountId()).orElseThrow(this::expired);
        SessionView next = parentSession(guardian, studentId, current.getMethods(), current.getContact());
        revoke(current.getId());
        return next;
    }

    @Transactional
    public void revoke(String sessionId) {
        if (sessionCache != null) sessionCache.evictSession(sessionId);
        sessions.findById(sessionId).ifPresent(s -> {
            s.setRevoked(true);
            sessions.save(s);
        });
    }

    public OtpService.ChallengeView requestStepUp(LoginSession s, String purpose) {
        if (!STEP_UP_PURPOSES.contains(purpose)) throw new AuthFlowException("BAD_PURPOSE", "Unknown action.", null, 400);
        String[] contact = s.getContact() == null ? new String[0] : s.getContact().split(":", 2);
        if (contact.length != 2) throw new AuthFlowException("NO_CONTACT", "No verified contact for this session.", null, 400);
        return otp.issue(contact[0], contact[1], "STEP_UP_" + purpose, s.getId());
    }

    /** Returns a single-use, 2-minute token. Endpoints for payments etc. consume it server-side. */
    @Transactional
    public StepUpToken verifyStepUp(LoginSession s, String challengeId, String code) {
        OtpChallenge c = otpForSession(challengeId, code, s);
        String token = randomId();
        Instant exp = Instant.now().plus(STEP_UP_TTL);
        tickets.save(AuthTicket.builder().id(token).kind(c.getPurpose()).accountId(s.getId()).methods("STEP_UP")
                .expiresAt(exp).used(false).build());
        return new StepUpToken(token, c.getPurpose().substring("STEP_UP_".length()), exp.toEpochMilli());
    }

    /** Parent actions a parent may confirm with the PIN instead of an SMS code (no SMS cost). */
    private static final Set<String> PIN_STEP_UP_PURPOSES = Set.of("PAYMENT", "PICKUP_AUTHORIZATION");

    /**
     * Confirm a payment or pickup pass with the parent's PIN instead of an SMS code. Same single-use,
     * 2-minute token as {@link #verifyStepUp}. Wrong PINs count towards the same 5-try lock as sign-in
     * (then "Forgot PIN" or the SMS code still works). Not for staff actions or for changing the PIN,
     * which keep the SMS code.
     */
    @Transactional(noRollbackFor = AuthFlowException.class)
    public StepUpToken verifyStepUpWithPin(LoginSession s, UserRole role, String purpose, String pin) {
        if (!PIN_STEP_UP_PURPOSES.contains(purpose) || role != UserRole.PARENT) {
            throw new AuthFlowException("OTP_REQUIRED", "Please confirm with the SMS code.", null, 400);
        }
        if (s.getMethods() != null && java.util.Arrays.asList(s.getMethods().split(",")).contains("PIN_RESET")) {
            throw new AuthFlowException("PIN_SETUP_REQUIRED", "Set your 4-digit sign-in PIN first.", null, 403);
        }
        UserAccount a = accounts.findById(s.getAccountId()).orElseThrow(this::expired);
        if (a.getPinHash() == null) throw new AuthFlowException("PIN_SETUP_REQUIRED", "Set your 4-digit sign-in PIN first.", null, 403);
        checkPin(a, pin);
        String token = randomId();
        Instant exp = Instant.now().plus(STEP_UP_TTL);
        tickets.save(AuthTicket.builder().id(token).kind("STEP_UP_" + purpose).accountId(s.getId()).methods("STEP_UP_PIN")
                .expiresAt(exp).used(false).build());
        return new StepUpToken(token, purpose, exp.toEpochMilli());
    }

    /** For future data endpoints: true exactly once for a fresh token of this purpose and session. */
    @Transactional
    public boolean consumeStepUp(String token, String purpose, LoginSession s) {
        AuthTicket t = token == null ? null : tickets.findById(token).orElse(null);
        if (t == null || t.isUsed() || Instant.now().isAfter(t.getExpiresAt())) return false;
        if (!("STEP_UP_" + purpose).equals(t.getKind()) || !t.getAccountId().equals(s.getId())) return false;
        t.setUsed(true);
        tickets.save(t);
        return true;
    }

    private OtpChallenge otpForSession(String challengeId, String code, LoginSession s) {
        // The challenge's purpose is checked against what was issued for this session.
        for (String p : STEP_UP_PURPOSES) {
            try {
                return otp.verify(challengeId, code, "STEP_UP_" + p, s.getId());
            } catch (AuthFlowException e) {
                if (!"NOT_FOUND".equals(e.getCode())) throw e;
            }
        }
        throw new AuthFlowException("NOT_FOUND", "This code is no longer valid. Start again.");
    }

    // ================================================================== helpers

    SessionView openSession(UserAccount a, SchoolMembership m, String studentId, String methods, String contact, List<ChildView> linkedChildren) {
        School school = schools.findById(m.getSchoolId()).filter(s -> "ACTIVE".equals(s.getStatus()))
                .orElseThrow(() -> new AuthFlowException("SCHOOL_INACTIVE", "This school is not available right now."));
        Instant now = Instant.now();
        Instant exp = now.plus(SESSION_TTL.getOrDefault(m.getRole(), Duration.ofHours(12)));
        LoginSession s = sessions.save(LoginSession.builder().id("SES-" + randomId()).accountId(a.getId()).membershipId(m.getId())
                .schoolId(m.getSchoolId()).studentId(studentId).methods(methods).contact(contact)
                .issuedAt(now).expiresAt(exp).revoked(false).build());
        String role = m.getRole().name();
        String token = jwt.generateAccessToken(a.getLoginId(), a.getId(), m.getId(), m.getSchoolId(), role.toLowerCase(), a.getName(), s.getId(), studentId, exp);

        Map<String, Object> profile = new LinkedHashMap<>();
        profile.put("id", a.getId());
        profile.put("name", a.getName());
        profile.put("email", a.getEmail() == null ? "" : a.getEmail());
        profile.put("role", role);
        profile.put("avatar", avatar(a.getName(), role.equals("PARENT") ? "ccfbf1" : "e2e8f0"));
        profile.put("roleLabel", role.equals("PARENT") ? "Parent / Guardian" : (m.getTitle() == null ? role : m.getTitle()));
        profile.put("tenantId", school.getId());
        profile.put("schoolCode", school.getId());
        profile.put("schoolName", school.getName());
        profile.put("requiresMfa", m.getRole() == UserRole.ADMIN || m.getRole() == UserRole.PRINCIPAL);
        if (studentId != null) {
            linkedChildren.stream().filter(c -> c.id().equals(studentId)).findFirst().ifPresent(c -> {
                profile.put("studentId", c.id());
                profile.put("studentName", c.name());
                profile.put("grade", c.grade());
                profile.put("section", c.section());
                profile.put("rollNumber", c.rollNumber());
                profile.put("activeChild", c);
            });
            profile.put("linkedChildren", linkedChildren);
        }
        List<String> perms = m.getRole() == UserRole.ADMIN && m.getPermissions() != null && !m.getPermissions().isBlank()
                ? Arrays.stream(m.getPermissions().split(",")).map(String::trim).toList() : List.of();
        long admins = memberships.countBySchoolIdAndRoleAndActiveTrue(m.getSchoolId(), UserRole.ADMIN);
        return new SessionView(s.getId(), a.getId(), role, m.getSchoolId(), studentId, List.of(methods.split(",")),
                now.toEpochMilli(), exp.toEpochMilli(), token, profile, perms, new Quorum(admins, admins >= 2));
    }

    private List<MembershipView> options(UserAccount a, Set<UserRole> roles) {
        List<MembershipView> out = activeMemberships(a, roles.toArray(UserRole[]::new)).stream()
                .map(m -> new MembershipView(m.getId(), m.getRole().name(), m.getSchoolId(),
                        schools.findById(m.getSchoolId()).map(School::getName).orElse(m.getSchoolId()),
                        m.getTitle() == null ? m.getRole().name() : m.getTitle(), m.getRole() == UserRole.TEACHER && m.getPinHash() != null))
                .toList();
        if (out.isEmpty()) throw new AuthFlowException("NOT_LINKED", "This account has no active school access.");
        return out;
    }

    private SchoolMembership pickMembership(UserAccount a, String membershipId, Set<UserRole> roles) {
        return memberships.findByIdAndAccountId(membershipId, a.getId())
                .filter(SchoolMembership::isActive)
                .filter(m -> roles.contains(m.getRole()))
                .orElseThrow(() -> new AuthFlowException("NOT_LINKED", "That role is not available for this account."));
    }

    private List<UserAccount> activeAccountsByMobile(String mobile) {
        return accounts.findByMobile(mobile).stream().filter(UserAccount::isActive).toList();
    }

    private List<SchoolMembership> activeMemberships(UserAccount a, UserRole... roles) {
        Set<UserRole> want = Set.of(roles);
        return memberships.findByAccountIdAndActiveTrue(a.getId()).stream()
                .filter(m -> want.contains(m.getRole()))
                .filter(m -> schools.findById(m.getSchoolId()).map(s -> "ACTIVE".equals(s.getStatus())).orElse(false))
                .toList();
    }

    /**
     * Microsoft/Google first factor for a Principal/Admin. As with the password, the email code to
     * the school mailbox always follows (staff/verify). A pending link is applied only after it.
     */
    StaffFirstFactor idpFirstFactor(UserAccount a, String provider, String inviteToken, String pendingSubject, String pendingEmail, String otpEmail) {
        String id = "TKT-" + randomId();
        tickets.save(AuthTicket.builder().id(id).kind("STAFF_FIRST_FACTOR").accountId(a.getId()).methods("IDP_" + provider)
                .expiresAt(Instant.now().plus(TICKET_TTL)).used(false).inviteToken(inviteToken)
                .pendingIdpProvider(pendingSubject == null ? null : provider).pendingIdpSubject(pendingSubject).pendingIdpEmail(pendingEmail).build());
        return new StaffFirstFactor(id, otp.issue("EMAIL", otpEmail.toLowerCase(), "STAFF_SECOND_FACTOR", id));
    }

    /** Leadership (Principal/Admin) membership still active in an active school. */
    boolean isActiveLeadership(UserAccount a) {
        return a != null && a.isActive() && !activeMemberships(a, UserRole.ADMIN, UserRole.PRINCIPAL).isEmpty();
    }

    /** A valid invitation for this email, or null. */
    StaffInvitation invitationFor(String token, String email) {
        return validInvite(token, email);
    }

    private String newTicket(String kind, String accountId, String methods) {
        String id = "TKT-" + randomId();
        tickets.save(AuthTicket.builder().id(id).kind(kind).accountId(accountId).methods(methods)
                .expiresAt(Instant.now().plus(TICKET_TTL)).used(false).build());
        return id;
    }

    private AuthTicket peekTicket(String id, String kind) {
        AuthTicket t = id == null ? null : tickets.findById(id).orElse(null);
        if (t == null || t.isUsed() || !kind.equals(t.getKind()) || Instant.now().isAfter(t.getExpiresAt())) throw expired();
        return t;
    }

    private AuthTicket takeTicket(String id, String kind) {
        AuthTicket t = peekTicket(id, kind);
        t.setUsed(true);
        tickets.save(t);
        return t;
    }

    private AuthFlowException expired() {
        return new AuthFlowException("TICKET_EXPIRED", "Your sign-in has expired. Please start again.");
    }

    private String randomId() {
        byte[] b = new byte[24];
        random.nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }

    private static String avatar(String name, String bg) {
        return "https://api.dicebear.com/7.x/notionists/svg?seed=" + URLEncoder.encode(name, StandardCharsets.UTF_8) + "&backgroundColor=" + bg;
    }

    private static String boardLabel(String board) {
        return "TELANGANA_SSC".equals(board) ? "Telangana State SSC" : board;
    }
}
