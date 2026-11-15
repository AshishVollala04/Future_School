package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

/** Marks for one class + subject + assessment. Entered by the Subject Teacher, reviewed by the Class Teacher. School-scoped. */
@Entity
@Table(name = "marks_sheets", indexes = {
    @Index(name = "idx_sheet_class", columnList = "assessment_id, class_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MarksSheet extends TenantScopedEntity {

    @Id
    @Column(name = "id", length = 200)
    private String id;

    @Column(name = "assessment_id", nullable = false, length = 64)
    private String assessmentId;

    @Column(name = "class_id", nullable = false, length = 64)
    private String classId;

    @Column(name = "subject", nullable = false, length = 64)
    private String subject;

    @Column(name = "teacher_staff_id", nullable = false, length = 64)
    private String teacherStaffId;

    @Column(name = "status", nullable = false, length = 16)
    private String status;

    @Column(name = "rows_json", nullable = false, length = 20000)
    private String rowsJson;

    @Column(name = "return_reason", length = 500)
    private String returnReason;

    @Column(name = "log_json", nullable = false, length = 20000)
    private String logJson;
}
