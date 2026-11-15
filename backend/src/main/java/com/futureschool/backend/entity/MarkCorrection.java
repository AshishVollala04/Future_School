package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

/**
 * A correction to a PUBLISHED result. Never overwrites: republishing creates a new version.
 * Subject Teacher raises -> Class Teacher verifies -> Principal approves (OTP) -> Class Teacher republishes.
 * from/to hold a number or "AB". School-scoped.
 */
@Entity
@Table(name = "mark_corrections", indexes = {@Index(name = "idx_correction_class", columnList = "class_id")})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MarkCorrection extends TenantScopedEntity {

    @Id
    @Column(name = "id", length = 96)
    private String id;

    @Column(name = "result_id", nullable = false, length = 200)
    private String resultId;

    @Column(name = "student_id", nullable = false, length = 64)
    private String studentId;

    @Column(name = "class_id", nullable = false, length = 64)
    private String classId;

    @Column(name = "exam_name", nullable = false, length = 32)
    private String examName;

    @Column(name = "subject", nullable = false, length = 64)
    private String subject;

    @Column(name = "field", nullable = false, length = 16)
    private String field;

    @Column(name = "from_value", nullable = false, length = 8)
    private String fromValue;

    @Column(name = "to_value", nullable = false, length = 8)
    private String toValue;

    @Column(name = "reason", nullable = false, length = 500)
    private String reason;

    @Column(name = "raised_by", nullable = false, length = 64)
    private String raisedBy;

    @Column(name = "status", nullable = false, length = 16)
    private String status;

    @Column(name = "log_json", nullable = false, length = 20000)
    private String logJson;
}
