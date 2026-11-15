package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * Links a person (UserAccount) to a school with exactly one role there.
 * A parent can hold memberships in several schools (children in two schools). A teacher
 * teaches in ONE school only (enforced in AuthService and by migration V5). A session is
 * always for ONE membership.
 * Global table: looked up at login, before any school is chosen.
 */
@Entity
@Table(name = "school_memberships", indexes = {
    @Index(name = "idx_membership_account", columnList = "account_id"),
    @Index(name = "uk_membership_account_school_role", columnList = "account_id, school_id, role", unique = true)
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SchoolMembership implements PinHolder {

    @Id
    @Column(name = "id", length = 64)
    private String id;

    @Column(name = "account_id", nullable = false, length = 64)
    private String accountId;

    @Column(name = "school_id", nullable = false, length = 64)
    private String schoolId;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false, length = 32)
    private UserRole role;

    @Column(name = "title", length = 128)
    private String title;

    /** Admin only: comma-separated permissions (FINANCE, ADMISSIONS, ACADEMIC_OPS, TRANSPORT, COMPLAINTS, SECURITY, REPORTS). */
    @Column(name = "permissions", length = 255)
    private String permissions;

    /** Suspended, never deleted. */
    @Column(name = "active", nullable = false)
    @Builder.Default
    private boolean active = true;

    /** Teacher only: optional 4-digit sign-in PIN (asked after the SMS OTP). Only a BCrypt hash is stored. */
    @Column(name = "pin_hash", length = 100)
    private String pinHash;

    /** Wrong PINs in a row (counted atomically, see SignInService.checkPin). At 5 the PIN is locked until "Forgot PIN" (SMS code) or an Admin reset. */
    @Column(name = "pin_failed_attempts", nullable = false)
    @Builder.Default
    private int pinFailedAttempts = 0;

    @Convert(converter = InstantMillisConverter.class)
    @Column(name = "pin_updated_at")
    private java.time.Instant pinUpdatedAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
