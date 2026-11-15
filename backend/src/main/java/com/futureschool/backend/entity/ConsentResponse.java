package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

/** A guardian response. Final from the parent side and never rewritten by staff (insert-only). School-scoped. */
@Entity
@Table(name = "consent_responses", indexes = {
    @Index(name = "uk_consent_response", columnList = "school_id, consent_id, student_id", unique = true)
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ConsentResponse extends TenantScopedEntity {

    @Id
    @Column(name = "id", length = 96)
    private String id;

    @Column(name = "consent_id", nullable = false, length = 96)
    private String consentId;

    @Column(name = "student_id", nullable = false, length = 64)
    private String studentId;

    @Column(name = "decision", nullable = false, length = 16)
    private String decision;

    @Column(name = "guardian_id", nullable = false, length = 64)
    private String guardianId;

    @Column(name = "responded_at", nullable = false, length = 40)
    private String at;
}
