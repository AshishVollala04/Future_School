package com.futureschool.backend.security;

import com.futureschool.backend.entity.LoginSession;
import com.futureschool.backend.entity.SchoolMembership;
import com.futureschool.backend.entity.UserAccount;
import com.futureschool.backend.entity.UserRole;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import java.util.Collection;
import java.util.List;

/**
 * The authenticated person for one request: account + the ONE membership (school + role)
 * their token was issued for. Authorities come from the membership, not the account.
 */
public record SchoolPrincipal(UserAccount account, SchoolMembership membership, LoginSession session) {

    /** Parent sessions are for ONE child. */
    public String sessionStudentId() {
        return session == null ? null : session.getStudentId();
    }

    public String loginId() {
        return account.getLoginId();
    }

    public String schoolId() {
        return membership.getSchoolId();
    }

    public UserRole role() {
        return membership.getRole();
    }

    public boolean isStaff() {
        UserRole r = role();
        return r == UserRole.ADMIN || r == UserRole.PRINCIPAL || r == UserRole.TEACHER;
    }

    public Collection<? extends GrantedAuthority> authorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_" + role().name()));
    }

    /** Spring uses toString() in some places; never expose secrets here. */
    @Override
    public String toString() {
        return loginId();
    }
}
