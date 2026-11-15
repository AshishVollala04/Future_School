package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "user_accounts", indexes = {
    @Index(name = "idx_user_login_id", columnList = "login_id", unique = true),
    @Index(name = "idx_user_mobile", columnList = "mobile"),
    @Index(name = "idx_user_email", columnList = "email")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserAccount implements PinHolder {

    @Id
    @Column(name = "id", length = 64)
    private String id;

    @Column(name = "login_id", nullable = false, unique = true, length = 64)
    private String loginId;

    @Column(name = "password", nullable = false)
    private String password;

    @Column(name = "name", nullable = false, length = 128)
    private String name;

    /** 10-digit mobile used for OTP sign-in (parents, teachers). */
    @Column(name = "mobile", length = 16)
    private String mobile;

    /** Parents only: 4-digit sign-in PIN for the whole account (all schools). Only a BCrypt hash. */
    @Column(name = "pin_hash", length = 100)
    private String pinHash;

    @Column(name = "pin_failed_attempts", nullable = false)
    @Builder.Default
    private int pinFailedAttempts = 0;

    @Convert(converter = InstantMillisConverter.class)
    @Column(name = "pin_updated_at")
    private java.time.Instant pinUpdatedAt;

    @Column(name = "email", length = 128)
    private String email;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false, length = 32)
    private UserRole role;

    @Column(name = "status", nullable = false, length = 32)
    @Builder.Default
    private String status = "Active";

    @Column(name = "active", nullable = false)
    @Builder.Default
    private boolean active = true;

    @Column(name = "student_id", length = 64)
    private String studentId;

    @Column(name = "teacher_id", length = 64)
    private String teacherId;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "parent_linked_students", joinColumns = @JoinColumn(name = "user_account_id"))
    @Column(name = "linked_student_id")
    @Builder.Default
    private List<String> linkedStudentIds = new ArrayList<>();

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
