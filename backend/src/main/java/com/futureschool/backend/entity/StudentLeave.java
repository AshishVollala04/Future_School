package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

/**
 * Student leave. Parent applies -> Class Teacher approves/rejects. Approved leave is shown as
 * CONTEXT in the register; it never changes attendance by itself. School-scoped.
 */
@Entity
@Table(name = "student_leave_requests", indexes = {@Index(name = "idx_sleave_class", columnList = "class_id"), @Index(name = "idx_sleave_student", columnList = "student_id")})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StudentLeave extends TenantScopedEntity {
    @Id
    @Column(name = "id", length = 96)
    private String id;
    @Column(name = "student_id", nullable = false, length = 64)
    private String studentId;
    @Column(name = "class_id", nullable = false, length = 64)
    private String classId;
    @Column(name = "from_date", nullable = false, length = 10)
    private String fromDate;
    @Column(name = "to_date", nullable = false, length = 10)
    private String toDate;
    @Column(name = "kind", nullable = false, length = 32)
    private String kind;
    @Column(name = "reason", nullable = false, length = 500)
    private String reason;
    @Column(name = "requested_by_guardian_id", nullable = false, length = 64)
    private String requestedByGuardianId;
    @Column(name = "requested_at", nullable = false, length = 40)
    private String requestedAt;
    @Column(name = "status", nullable = false, length = 16)
    private String status;
    @Column(name = "decided_by", length = 64)
    private String decidedBy;
    @Column(name = "decided_by_name", length = 128)
    private String decidedByName;
    @Column(name = "decided_at", length = 40)
    private String decidedAt;
    @Column(name = "decision_note", length = 300)
    private String decisionNote;
}
