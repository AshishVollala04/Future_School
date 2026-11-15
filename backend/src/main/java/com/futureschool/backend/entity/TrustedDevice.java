package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/**
 * A phone or computer on which a teacher or parent signed in with an SMS code. On it, they sign in
 * next time with the PIN only (no SMS), until it expires (90 days) or is forgotten / revoked.
 * Only a SHA-256 hash of the device token is stored; the token itself lives on the device.
 */
@Entity
@Table(name = "trusted_devices", indexes = {
    @Index(name = "uk_trusted_device_token", columnList = "token_hash", unique = true),
    @Index(name = "idx_trusted_device_account", columnList = "account_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TrustedDevice {

    @Id
    @Column(name = "id", length = 64)
    private String id;

    @Column(name = "token_hash", nullable = false, length = 64)
    private String tokenHash;

    @Column(name = "account_id", nullable = false, length = 64)
    private String accountId;

    @Column(name = "membership_id", nullable = false, length = 64)
    private String membershipId;

    /** TEACHER or PARENT. A parent device signs in to the account, then the parent picks a child. */
    @Column(name = "kind", nullable = false, length = 16)
    @Builder.Default
    private String kind = "TEACHER";

    /** e.g. "Chrome on Android", for the teacher's own reference. */
    @Column(name = "label", length = 120)
    private String label;

    @Convert(converter = InstantMillisConverter.class)
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Convert(converter = InstantMillisConverter.class)
    @Column(name = "last_used_at")
    private Instant lastUsedAt;

    @Convert(converter = InstantMillisConverter.class)
    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "revoked", nullable = false)
    private boolean revoked;
}
