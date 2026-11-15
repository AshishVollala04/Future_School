package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/**
 * Short-lived, single-use proof that a sign-in step succeeded (e.g. OTP verified),
 * exchanged for a session once the person chooses a school/child. Grants no data access.
 */
@Entity
@Table(name = "auth_tickets")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuthTicket {

    @Id
    @Column(name = "id", length = 64)
    private String id;

    /** PARENT, TEACHER, STAFF_FIRST_FACTOR, STAFF_VERIFIED */
    @Column(name = "kind", nullable = false, length = 32)
    private String kind;

    @Column(name = "account_id", nullable = false, length = 64)
    private String accountId;

    /** Comma-separated sign-in methods so far, e.g. "PASSWORD,EMAIL_OTP". */
    @Column(name = "methods", nullable = false, length = 128)
    private String methods;

    @Convert(converter = InstantMillisConverter.class)
    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "used", nullable = false)
    private boolean used;

    /** Invitation acceptance only: bcrypt hash of the chosen password, applied after the email OTP. */
    @Column(name = "pending_password_hash", length = 100)
    private String pendingPasswordHash;

    @Column(name = "invite_token", length = 64)
    private String inviteToken;

    /** Microsoft/Google first factor whose identity is linked only after the email code (STAFF_FIRST_FACTOR). */
    @Column(name = "pending_idp_provider", length = 16)
    private String pendingIdpProvider;

    @Column(name = "pending_idp_subject", length = 200)
    private String pendingIdpSubject;

    @Column(name = "pending_idp_email", length = 200)
    private String pendingIdpEmail;
}
