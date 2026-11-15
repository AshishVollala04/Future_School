package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

/** A student report card for one assessment. Principal approves or returns it; only the Class Teacher publishes. School-scoped. */
@Entity
@Table(name = "report_cards", indexes = {
    @Index(name = "idx_card_class", columnList = "assessment_id, class_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ReportCard extends TenantScopedEntity {

    @Id
    @Column(name = "id", length = 200)
    private String id;

    @Column(name = "assessment_id", nullable = false, length = 64)
    private String assessmentId;

    @Column(name = "class_id", nullable = false, length = 64)
    private String classId;

    @Column(name = "student_id", nullable = false, length = 64)
    private String studentId;

    @Column(name = "subjects_json", nullable = false, length = 20000)
    private String subjectsJson;

    @Column(name = "class_teacher_remark", nullable = false, length = 300)
    private String classTeacherRemark;

    @Column(name = "status", nullable = false, length = 16)
    private String status;

    @Column(name = "principal_note", length = 500)
    private String principalNote;

    @Column(name = "log_json", nullable = false, length = 20000)
    private String logJson;
}
