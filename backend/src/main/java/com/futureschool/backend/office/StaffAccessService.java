package com.futureschool.backend.office;

import com.futureschool.backend.auth.AuthFlowException;
import com.futureschool.backend.auth.SignInService;
import com.futureschool.backend.entity.*;
import com.futureschool.backend.governance.GovernanceService;
import com.futureschool.backend.repository.*;
import com.futureschool.backend.security.SchoolPrincipal;
import com.futureschool.backend.teaching.Teaching;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.*;

/**
 * Staff access (Admin with SECURITY): Principal/Admin accounts of this school, invitations,
 * suspend / reactivate. Nothing is deleted. The school must keep at least two active Admins.
 * Suspending or reactivating needs a reason and a fresh SENSITIVE_STAFF_ACTION OTP. You cannot
 * change your own access.
 */
@Service
public class StaffAccessService {

    private static final Duration INVITE_TTL = Duration.ofHours(48);
    private static final Set<String> PERMISSIONS = Set.of("FINANCE", "ADMISSIONS", "ACADEMIC_OPS", "TRANSPORT", "COMPLAINTS", "SECURITY", "REPORTS");

    private final UserAccountRepository accounts;
    private final SchoolMembershipRepository memberships;
    private final StaffInvitationRepository invitations;
    private final PasswordEncoder passwords;
    private final SignInService signIn;
    private final Teaching t;
    private final SecureRandom random = new SecureRandom();
    private com.futureschool.backend.security.AuthSessionCache sessionCache;

    public StaffAccessService(UserAccountRepository accounts, SchoolMembershipRepository memberships, StaffInvitationRepository invitations,
                              PasswordEncoder passwords, SignInService signIn, Teaching t) {
        this.accounts = accounts;
        this.memberships = memberships;
        this.invitations = invitations;
        this.passwords = passwords;
        this.signIn = signIn;
        this.t = t;
    }

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    public void setSessionCache(com.futureschool.backend.security.AuthSessionCache sessionCache) {
        this.sessionCache = sessionCache;
    }

    private long activeAdmins(String school) {
        return memberships.countBySchoolIdAndRoleAndActiveTrue(school, UserRole.ADMIN);
    }

    private Map<String, Object> view(UserAccount a, SchoolMembership m) {
        Map<String, Object> v = new LinkedHashMap<>();
        boolean invited = "Invited".equals(a.getStatus());
        v.put("accountId", a.getId());
        v.put("name", a.getName());
        v.put("email", a.getEmail());
        v.put("role", m.getRole().name());
        v.put("title", m.getTitle() == null ? m.getRole().name() : m.getTitle());
        v.put("status", invited ? "INVITED" : m.isActive() && a.isActive() ? "ACTIVE" : "DISABLED");
        v.put("signIn", invited ? List.of() : List.of("Password"));
        v.put("permissions", m.getPermissions() == null || m.getPermissions().isBlank() ? List.of() : List.of(m.getPermissions().split(",")));
        if (invited) {
            invitations.findBySchoolId(m.getSchoolId()).stream()
                    .filter(i -> i.getAccountId().equals(a.getId()) && i.getUsedAt() == null && Instant.now().isBefore(i.getExpiresAt()))
                    .findFirst().ifPresent(i -> v.put("pendingInvite", Map.of("token", i.getToken(), "expiresAt", i.getExpiresAt().toEpochMilli())));
        }
        return v;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> list(SchoolPrincipal p) {
        GovernanceService.requirePermission(p, "SECURITY");
        String school = t.school();
        List<Map<String, Object>> out = new ArrayList<>();
        for (SchoolMembership m : memberships.findBySchoolId(school)) {
            if (m.getRole() != UserRole.ADMIN && m.getRole() != UserRole.PRINCIPAL) continue;
            accounts.findById(m.getAccountId()).ifPresent(a -> out.add(view(a, m)));
        }
        out.sort(Comparator.comparing((Map<String, Object> m) -> m.get("role").toString()).reversed().thenComparing(m -> m.get("name").toString()));
        return out;
    }

    @Transactional
    public Map<String, Object> invite(SchoolPrincipal p, String name, String email, String title, List<String> perms) {
        return invite(p, name, email, title, perms, "ADMIN");
    }

    @Transactional
    public Map<String, Object> invite(SchoolPrincipal p, String name, String email, String title, List<String> perms, String roleName) {
        GovernanceService.requirePermission(p, "SECURITY");
        UserRole role = "PRINCIPAL".equalsIgnoreCase(roleName) ? UserRole.PRINCIPAL : UserRole.ADMIN;
        String e = email == null ? "" : email.trim().toLowerCase();
        if (!e.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")) throw Teaching.rule("BAD_EMAIL", "Enter the school email address.");
        String n = name == null ? "" : name.trim();
        if (n.length() < 3) throw Teaching.rule("BAD_NAME", "Enter the full name.");
        List<String> ps = perms == null ? List.of() : perms.stream().filter(PERMISSIONS::contains).distinct().toList();
        if (role == UserRole.ADMIN && ps.isEmpty()) throw Teaching.rule("NO_PERMISSIONS", "Choose at least one permission.");
        if (accounts.findByEmailIgnoreCase(e).isPresent()) throw Teaching.rule("EXISTS", "An account with this email already exists.");
        String school = t.school();
        byte[] b = new byte[24];
        random.nextBytes(b);
        UserAccount a = accounts.save(UserAccount.builder().id("ACC-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase()).loginId(e)
                .password(passwords.encode(Base64.getUrlEncoder().encodeToString(b))) // unusable until the invite sets a password
                .name(n).email(e).role(role).status("Invited").active(false).linkedStudentIds(new ArrayList<>()).build());
        String defaultTitle = role == UserRole.PRINCIPAL ? "Principal" : "Administrator";
        SchoolMembership m = memberships.save(SchoolMembership.builder().id("MEM-" + UUID.randomUUID()).accountId(a.getId()).schoolId(school)
                .role(role).title(title == null || title.isBlank() ? defaultTitle : title.trim())
                .permissions(role == UserRole.ADMIN ? String.join(",", ps) : "").active(false).build());
        random.nextBytes(b);
        String token = "inv-" + school.toLowerCase() + "-" + Base64.getUrlEncoder().withoutPadding().encodeToString(b).substring(0, 16);
        Instant exp = Instant.now().plus(INVITE_TTL);
        invitations.save(StaffInvitation.builder().token(token).accountId(a.getId()).membershipId(m.getId()).email(e).role(role.name()).schoolId(school)
                .invitedBy(p.account().getId()).expiresAt(exp).build());
        t.record(p, role == UserRole.PRINCIPAL ? "PRINCIPAL_INVITED" : "ADMIN_INVITED", a.getId(), e + (ps.isEmpty() ? "" : " · " + String.join(", ", ps)), null);
        return Map.of("token", token, "expiresAt", exp.toEpochMilli());
    }

    @Transactional(noRollbackFor = AuthFlowException.class)
    public Map<String, Object> setStatus(SchoolPrincipal p, String accountId, String status, String reason, String stepUpToken) {
        GovernanceService.requirePermission(p, "SECURITY");
        String school = t.school();
        if (p.account().getId().equals(accountId)) throw Teaching.rule("SELF", "You cannot change your own access.");
        SchoolMembership m = memberships.findBySchoolId(school).stream().filter(x -> x.getAccountId().equals(accountId) && x.getRole() == UserRole.ADMIN)
                .findFirst().orElseThrow(() -> Teaching.denied("Admin account not found in this school."));
        UserAccount a = accounts.findById(accountId).orElseThrow(() -> Teaching.denied("Admin account not found in this school."));
        String r = reason == null ? "" : reason.trim();
        if (r.length() < 10) throw Teaching.rule("REASON", "Give a reason (10+ characters).");
        if ("Invited".equals(a.getStatus())) throw Teaching.rule("STATE", "This person has not accepted the invitation yet.");
        if ("DISABLED".equals(status)) {
            if (!m.isActive()) throw Teaching.rule("STATE", "This account is not active.");
            if (activeAdmins(school) - 1 < 2) throw Teaching.rule("QUORUM", "Blocked: the school must keep at least two active Admins. Invite and activate another Admin first.");
        } else if ("ACTIVE".equals(status)) {
            if (m.isActive()) throw Teaching.rule("STATE", "Only a suspended account can be reactivated.");
        } else {
            throw Teaching.rule("BAD_STATUS", "Suspend or reactivate.");
        }
        if (!signIn.consumeStepUp(stepUpToken, "SENSITIVE_STAFF_ACTION", p.session())) {
            throw new AuthFlowException("STEP_UP_REQUIRED", "Please confirm with the OTP again.", null, 401);
        }
        m.setActive("ACTIVE".equals(status));
        memberships.save(m);
        if (sessionCache != null) sessionCache.evictMembership(m.getId());
        t.record(p, "DISABLED".equals(status) ? "ADMIN_SUSPENDED" : "ADMIN_REACTIVATED", accountId, a.getEmail(), r);
        return view(a, m);
    }
}
