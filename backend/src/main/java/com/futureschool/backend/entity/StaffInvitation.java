package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/**
 * A single-use invitation for a new Principal/Admin account (48 hours). Global table: it is
 * opened before sign-in. Accepting it needs a new password AND an email OTP.
 */
@Entity
@Table(name = "staff_invitations")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StaffInvitation {
    @Id
    @Column(name = "token", length = 64)
    private String token;
    @Column(name = "account_id", nullable = false, length = 64)
    private String accountId;
    @Column(name = "membership_id", nullable = false, length = 64)
    private String membershipId;
    @Column(name = "email", nullable = false, length = 160)
    private String email;
    @Column(name = "role", nullable = false, length = 16)
    private String role;
    @Column(name = "school_id", nullable = false, length = 64)
    private String schoolId;
    @Column(name = "invited_by", nullable = false, length = 64)
    private String invitedBy;
    @Convert(converter = InstantMillisConverter.class)
    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;
    @Convert(converter = InstantMillisConverter.class)
    @Column(name = "used_at")
    private Instant usedAt;
}
