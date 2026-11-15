package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

/**
 * Teacher leave. Teacher applies -> Principal approves/rejects -> Admin (ACADEMIC_OPS) assigns a
 * free teacher to each period. Substitution slots are kept as JSON. School-scoped.
 */
@Entity
@Table(name = "teacher_leave_requests", indexes = {@Index(name = "idx_tleave_staff", columnList = "staff_id")})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TeacherLeaveRequest extends TenantScopedEntity {
    @Id
    @Column(name = "id", length = 96)
    private String id;
    @Column(name = "staff_id", nullable = false, length = 64)
    private String staffId;
    @Column(name = "staff_name", nullable = false, length = 128)
    private String staffName;
    @Column(name = "from_date", nullable = false, length = 10)
    private String fromDate;
    @Column(name = "to_date", nullable = false, length = 10)
    private String toDate;
    @Column(name = "kind", nullable = false, length = 16)
    private String kind;
    @Column(name = "reason", nullable = false, length = 500)
    private String reason;
    @Column(name = "status", nullable = false, length = 16)
    private String status;
    @Column(name = "decided_by", length = 64)
    private String decidedBy;
    @Column(name = "decided_at", length = 40)
    private String decidedAt;
    @Column(name = "decision_note", length = 300)
    private String decisionNote;
    @Column(name = "arranged_by", length = 64)
    private String arrangedBy;
    @Column(name = "substitution_json", nullable = false, length = 20000)
    private String substitutionJson;
}
