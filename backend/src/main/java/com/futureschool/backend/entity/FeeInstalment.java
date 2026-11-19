package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

/** One of the 4 fee instalments of a school year. School-scoped. */
@Entity
@Table(name = "fee_instalments")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FeeInstalment extends TenantScopedEntity {

    @Id
    @Column(name = "id", length = 96)
    private String id;

    @Column(name = "number", nullable = false)
    private Integer number;

    @Column(name = "label", nullable = false, length = 64)
    private String label;

    @Column(name = "due_on", nullable = false, length = 10)
    private String dueOn;

    /** The academic year this schedule belongs to. Null only on rows created before V13 (read as the current year). */
    @Column(name = "academic_year_id", length = 64)
    private String academicYearId;
}
