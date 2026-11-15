package com.futureschool.backend.service;

import com.futureschool.backend.dto.AccountDTO;
import com.futureschool.backend.entity.SchoolMembership;
import com.futureschool.backend.entity.UserAccount;
import com.futureschool.backend.entity.UserRole;
import com.futureschool.backend.repository.SchoolMembershipRepository;
import com.futureschool.backend.repository.UserAccountRepository;
import com.futureschool.backend.security.SchoolPrincipal;
import com.futureschool.backend.tenant.TenantContext;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.List;
import java.util.UUID;

/**
 * School-scoped account management (sign-in lives in auth.SignInService).
 *
 * Account management only touches people who have a membership in the caller's school,
 * and changes the MEMBERSHIP (suspend), never deletes the person.
 */
@Service
public class AuthService {

    private static final int MIN_PASSWORD = 8;

    private final UserAccountRepository accounts;
    private final SchoolMembershipRepository memberships;
    private final PasswordEncoder passwordEncoder;
    private final MembershipService membershipService;
    private final SecureRandom random = new SecureRandom();

    public AuthService(UserAccountRepository accounts, SchoolMembershipRepository memberships, PasswordEncoder passwordEncoder,
                       MembershipService membershipService) {
        this.accounts = accounts;
        this.memberships = memberships;
        this.passwordEncoder = passwordEncoder;
        this.membershipService = membershipService;
    }

    // ------------------------------------------------------------------ current user

    public AccountDTO getCurrentUser(SchoolPrincipal p) {
        return toDto(p.account(), p.membership());
    }

    @Transactional
    public void changePassword(SchoolPrincipal p, String oldPassword, String newPassword) {
        UserAccount account = accounts.findById(p.account().getId()).orElseThrow();
        if (oldPassword == null || !passwordEncoder.matches(oldPassword, account.getPassword())) {
            throw new BadCredentialsException("Current password does not match.");
        }
        requireStrong(newPassword);
        account.setPassword(passwordEncoder.encode(newPassword));
        accounts.save(account);
    }

    // ------------------------------------------------------------------ admin: accounts in MY school

    public List<AccountDTO> listUsers(String roleFilter) {
        String school = TenantContext.require();
        List<SchoolMembership> ms = memberships.findBySchoolId(school);
        return ms.stream()
                .filter(m -> roleFilter == null || roleFilter.isBlank() || m.getRole().name().equalsIgnoreCase(roleFilter))
                .map(m -> accounts.findById(m.getAccountId()).map(a -> toDto(a, m)).orElse(null))
                .filter(java.util.Objects::nonNull)
                .toList();
    }

    @Transactional
    public AccountDTO registerUser(UserAccount account, UserRole role, String rawPassword, String title) {
        String school = TenantContext.require();
        if (account.getLoginId() == null || account.getLoginId().isBlank()) throw new IllegalArgumentException("Login ID is required.");
        if (accounts.existsByLoginIdIgnoreCase(account.getLoginId())) {
            throw new IllegalArgumentException("Login ID already in use.");
        }
        requireStrong(rawPassword);
        if (role == UserRole.TEACHER) membershipService.requireNotTeachingElsewhere(account, null);
        account.setId("USR-" + UUID.randomUUID());
        account.setRole(role);
        account.setPassword(passwordEncoder.encode(rawPassword));
        account.setActive(true);
        account.setStatus("Active");
        UserAccount saved = accounts.save(account);
        SchoolMembership m = memberships.save(SchoolMembership.builder()
                .id("MEM-" + UUID.randomUUID())
                .accountId(saved.getId())
                .schoolId(school)
                .role(role)
                .title(title)
                .active(true)
                .build());
        return toDto(saved, m);
    }

    /** Suspend or reactivate this person's access to MY school. Never deletes. */
    @Transactional
    public AccountDTO toggleUserStatus(SchoolPrincipal actor, String loginId) {
        String school = TenantContext.require();
        UserAccount target = accounts.findByLoginIdIgnoreCase(loginId).orElseThrow(() -> new IllegalArgumentException("User not found in this school."));
        if (target.getId().equals(actor.account().getId())) throw new IllegalArgumentException("You cannot change your own access.");
        SchoolMembership m = membershipIn(school, target);
        if (m.isActive() && m.getRole() == UserRole.ADMIN && memberships.countBySchoolIdAndRoleAndActiveTrue(school, UserRole.ADMIN) <= 2) {
            throw new IllegalArgumentException("The school must keep at least two active Admins.");
        }
        if (!m.isActive() && m.getRole() == UserRole.TEACHER) membershipService.requireNotTeachingElsewhere(target, m.getId());
        m.setActive(!m.isActive());
        memberships.save(m);
        return toDto(target, m);
    }

    @Transactional
    public String adminResetPassword(String loginId, String customPassword) {
        String school = TenantContext.require();
        UserAccount target = accounts.findByLoginIdIgnoreCase(loginId).orElseThrow(() -> new IllegalArgumentException("User not found in this school."));
        membershipIn(school, target);
        // A person who also belongs to another school must reset it themselves; one school's Admin
        // must not be able to take over access to another school.
        boolean elsewhere = memberships.findByAccountIdAndActiveTrue(target.getId()).stream().anyMatch(x -> !x.getSchoolId().equals(school));
        if (elsewhere) throw new IllegalArgumentException("This person also belongs to another school. They must use 'forgot password'.");
        String pwd = customPassword != null && !customPassword.isBlank() ? customPassword : temporaryPassword();
        requireStrong(pwd);
        target.setPassword(passwordEncoder.encode(pwd));
        accounts.save(target);
        return pwd;
    }

    private SchoolMembership membershipIn(String school, UserAccount target) {
        return memberships.findBySchoolId(school).stream()
                .filter(x -> x.getAccountId().equals(target.getId()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("User not found in this school."));
    }

    private String temporaryPassword() {
        String alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 12; i++) sb.append(alphabet.charAt(random.nextInt(alphabet.length())));
        return sb.toString();
    }

    private void requireStrong(String pwd) {
        if (pwd == null || pwd.length() < MIN_PASSWORD) {
            throw new IllegalArgumentException("Password must be at least " + MIN_PASSWORD + " characters.");
        }
    }

    public AccountDTO toDto(UserAccount account, SchoolMembership m) {
        String role = (m != null ? m.getRole() : account.getRole()).name().toLowerCase();
        return AccountDTO.builder()
                .id(account.getId())
                .loginId(account.getLoginId())
                .name(account.getName())
                .email(account.getEmail())
                .role(role)
                .status(m != null && !m.isActive() ? "Suspended" : account.getStatus())
                .active(account.isActive() && (m == null || m.isActive()))
                .studentId(account.getStudentId())
                .teacherId(account.getTeacherId())
                .linkedStudentIds(account.getLinkedStudentIds())
                .scope(role)
                .schoolId(m != null ? m.getSchoolId() : null)
                .membershipId(m != null ? m.getId() : null)
                .build();
    }
}
