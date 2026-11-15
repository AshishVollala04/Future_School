package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

/** A parent-teacher meeting for one student. School-scoped. */
@Entity
@Table(name = "parent_meetings")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ParentMeeting extends TenantScopedEntity {

    @Id
    @Column(name = "id", length = 96)
    private String id;

    @Column(name = "student_id", nullable = false, length = 64)
    private String studentId;

    @Column(name = "teacher_name", nullable = false, length = 128)
    private String teacherName;

    @Column(name = "purpose", nullable = false, length = 300)
    private String purpose;

    @Column(name = "meeting_at", nullable = false, length = 40)
    private String at;

    @Column(name = "status", nullable = false, length = 24)
    private String status;

    @Column(name = "parent_summary", length = 1000)
    private String parentSummary;
}
