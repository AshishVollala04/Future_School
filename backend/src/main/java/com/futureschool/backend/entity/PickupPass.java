package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

/** A one-time early-pickup pass for a named person. Issued only after a PICKUP_AUTHORIZATION OTP; only a hash of the code is stored; valid 2 hours; used once at the gate. School-scoped. */
@Entity
@Table(name = "pickup_passes", indexes = {
    @Index(name = "idx_pickup_code", columnList = "code_hash")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PickupPass extends TenantScopedEntity {

    @Id
    @Column(name = "id", length = 96)
    private String id;

    @Column(name = "student_id", nullable = false, length = 64)
    private String studentId;

    @Column(name = "issued_by_guardian_id", nullable = false, length = 64)
    private String issuedByGuardianId;

    @Column(name = "person_name", nullable = false, length = 128)
    private String personName;

    @Column(name = "relation", nullable = false, length = 64)
    private String relation;

    @Column(name = "mobile", nullable = false, length = 16)
    private String mobile;

    @Column(name = "reason", nullable = false, length = 300)
    private String reason;

    @Column(name = "code_hash", nullable = false, length = 128)
    private String codeHash;

    @Column(name = "issued_at", nullable = false, length = 40)
    private String issuedAt;

    @Convert(converter = InstantMillisConverter.class)
    @Column(name = "valid_until", nullable = false)
    private java.time.Instant validUntil;

    @Column(name = "status", nullable = false, length = 16)
    private String status;

    @Column(name = "used_at", length = 40)
    private String usedAt;

    @Column(name = "used_by", length = 64)
    private String usedBy;
}
