package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/**
 * A server-side session: exactly one account + one membership (school + role)
 * + one student for parents. Access tokens carry its id; revoking it ends the session.
 */
@Entity
@Table(name = "login_sessions", indexes = {
    @Index(name = "idx_session_account", columnList = "account_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LoginSession {

    @Id
    @Column(name = "id", length = 64)
    private String id;

    @Column(name = "account_id", nullable = false, length = 64)
    private String accountId;

    @Column(name = "membership_id", nullable = false, length = 64)
    private String membershipId;

    @Column(name = "school_id", nullable = false, length = 64)
    private String schoolId;

    /** Parent sessions only. */
    @Column(name = "student_id", length = 64)
    private String studentId;

    @Column(name = "methods", nullable = false, length = 128)
    private String methods;

    /** Where step-up OTPs go: SMS:mobile or EMAIL:address. */
    @Column(name = "contact", length = 200)
    private String contact;

    @Convert(converter = InstantMillisConverter.class)
    @Column(name = "issued_at", nullable = false)
    private Instant issuedAt;

    @Convert(converter = InstantMillisConverter.class)
    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "revoked", nullable = false)
    private boolean revoked;
}
