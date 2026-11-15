package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

/** An exam window (SA-1, SA-2, Pre-Final) with its Admin-configured fee clearance rule. School-scoped. */
@Entity
@Table(name = "exam_windows")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ExamWindow extends TenantScopedEntity {

    @Id
    @Column(name = "id", length = 96)
    private String id;

    @Column(name = "name", nullable = false, length = 32)
    private String name;

    @Column(name = "starts_on", nullable = false, length = 10)
    private String startsOn;

    @Column(name = "grades_csv", nullable = false, length = 64)
    private String gradesCsv;

    @Column(name = "clearance_categories_csv", nullable = false, length = 200)
    private String clearanceCategoriesCsv;

    @Column(name = "clearance_upto_instalment", nullable = false)
    private Integer clearanceUptoInstalment;
}
