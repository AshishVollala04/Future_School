package com.futureschool.backend.service;

import com.futureschool.backend.entity.SchoolMembership;
import com.futureschool.backend.entity.UserAccount;
import com.futureschool.backend.entity.UserRole;
import com.futureschool.backend.repository.SchoolMembershipRepository;
import com.futureschool.backend.repository.UserAccountRepository;
import com.futureschool.backend.tenant.TenantContext;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.UUID;

/** Gives an account access to the CURRENT school with a role. Idempotent. */
@Service
public class MembershipService {

    private final SchoolMembershipRepository memberships;
    private final UserAccountRepository accounts;
    private final SecureRandom random = new SecureRandom();

    public MembershipService(SchoolMembershipRepository memberships, UserAccountRepository accounts) {
        this.memberships = memberships;
        this.accounts = accounts;
    }

    /**
     * A teacher teaches in one school only. Refuse a teacher membership if this person, or anyone
     * signing in with the same mobile, is already an active teacher (here or in another school).
     * Every path that adds or reactivates a teacher membership calls this (the database index
     * uk_teacher_one_active_school is the last line of defence, with a less friendly error).
     */
    public void requireNotTeachingElsewhere(UserAccount person, String exceptMembershipId) {
        java.util.Set<String> ids = new java.util.HashSet<>();
        if (person.getId() != null) ids.add(person.getId());
        if (person.getMobile() != null && !person.getMobile().isBlank()) {
            accounts.findByMobile(person.getMobile()).forEach(a -> ids.add(a.getId()));
        }
        boolean teaching = ids.stream().flatMap(id -> memberships.findByAccountIdAndActiveTrue(id).stream())
                .anyMatch(x -> x.getRole() == UserRole.TEACHER && !x.getId().equals(exceptMembershipId));
        if (teaching) {
            throw new IllegalArgumentException("A teacher can belong to only one school. This person (or mobile number) is already an active teacher. "
                    + "Their current school must suspend that access first.");
        }
    }

    public SchoolMembership ensure(UserAccount account, UserRole role, String title) {
        String school = TenantContext.require();
        return memberships.findBySchoolId(school).stream()
                .filter(m -> m.getAccountId().equals(account.getId()) && m.getRole() == role)
                .findFirst()
                .orElseGet(() -> {
                    if (role == UserRole.TEACHER) requireNotTeachingElsewhere(account, null);
                    return memberships.save(SchoolMembership.builder()
                        .id("MEM-" + UUID.randomUUID())
                        .accountId(account.getId())
                        .schoolId(school)
                        .role(role)
                        .title(title)
                        .active(true)
                        .build());
                });
    }

    /**
     * Used when an account is created without a chosen password. Nobody knows it; the Admin
     * issues a real one with reset-password. Replaces the old shared default "password123".
     */
    public String unusablePassword() {
        byte[] b = new byte[24];
        random.nextBytes(b);
        return java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }
}
