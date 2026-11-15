package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

/** Class Teacher release (or audited Principal override). Payment alone never creates one. School-scoped. */
@Entity
@Table(name = "hall_ticket_releases", indexes = {
    @Index(name = "uk_release_school_exam_student", columnList = "school_id, exam_id, student_id", unique = true)
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class HallTicketRelease extends TenantScopedEntity {

    @Id
    @Column(name = "id", length = 96)
    private String id;

    @Column(name = "exam_id", nullable = false, length = 64)
    private String examId;

    @Column(name = "student_id", nullable = false, length = 64)
    private String studentId;

    @Column(name = "released_by", nullable = false, length = 64)
    private String releasedBy;

    @Column(name = "released_at", nullable = false, length = 40)
    private String releasedAt;

    @Column(name = "override_reason", length = 300)
    private String overrideReason;

    @Column(name = "override_by", length = 64)
    private String overrideBy;

    @Column(name = "override_at", length = 40)
    private String overrideAt;
}
