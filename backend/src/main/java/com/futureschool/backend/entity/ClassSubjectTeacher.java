package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

/** Who teaches which subject in a class this year. School-scoped. */
@Entity
@Table(name = "class_subject_teachers", indexes = {
    @Index(name = "idx_cst_class", columnList = "class_id"),
    @Index(name = "idx_cst_staff", columnList = "staff_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ClassSubjectTeacher extends TenantScopedEntity {

    @Id
    @Column(name = "id", length = 200)
    private String id;

    @Column(name = "class_id", nullable = false, length = 64)
    private String classId;

    @Column(name = "subject", nullable = false, length = 64)
    private String subject;

    @Column(name = "staff_id", nullable = false, length = 64)
    private String staffId;

    @Column(name = "staff_name", nullable = false, length = 128)
    private String staffName;
}
