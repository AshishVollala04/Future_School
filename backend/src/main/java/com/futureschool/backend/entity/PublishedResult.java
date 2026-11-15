package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

/** A published result version. Corrections create a new version; the old one becomes SUPERSEDED. Never overwritten. School-scoped. */
@Entity
@Table(name = "published_results", indexes = {
    @Index(name = "idx_result_student", columnList = "student_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PublishedResult extends TenantScopedEntity {

    @Id
    @Column(name = "id", length = 96)
    private String id;

    @Column(name = "student_id", nullable = false, length = 64)
    private String studentId;

    @Column(name = "exam_name", nullable = false, length = 32)
    private String examName;

    @Column(name = "version", nullable = false)
    private Integer version;

    @Column(name = "status", nullable = false, length = 16)
    private String status;

    @Column(name = "published_on", nullable = false, length = 10)
    private String publishedOn;

    @Column(name = "subjects_json", nullable = false, length = 4000)
    private String subjectsJson;

    @Column(name = "class_teacher_remark", length = 500)
    private String classTeacherRemark;
}
