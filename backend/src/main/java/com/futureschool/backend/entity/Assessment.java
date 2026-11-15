package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

/** An assessment (FA-2, SA-1 ...) with its marks scheme. Pass marks come from configuration, never hardcoded. School-scoped. */
@Entity
@Table(name = "assessments")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Assessment extends TenantScopedEntity {

    @Id
    @Column(name = "id", length = 200)
    private String id;

    @Column(name = "name", nullable = false, length = 32)
    private String name;

    @Column(name = "academic_year", nullable = false, length = 16)
    private String academicYear;

    @Column(name = "grades_csv", nullable = false, length = 64)
    private String gradesCsv;

    @Column(name = "max_internal", nullable = false)
    private Integer maxInternal;

    @Column(name = "max_external", nullable = false)
    private Integer maxExternal;

    @Column(name = "pass_percent", nullable = false)
    private Integer passPercent;

    @Column(name = "second_language_pass_percent", nullable = false)
    private Integer secondLanguagePassPercent;

    @Column(name = "second_language_subjects_csv", nullable = false, length = 200)
    private String secondLanguageSubjectsCsv;

    @Column(name = "status", nullable = false, length = 16)
    private String status;
}
