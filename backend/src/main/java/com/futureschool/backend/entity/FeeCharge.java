package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

/** An amount a student owes for one category in one instalment. Never edited after payment; changes go through governance. School-scoped. */
@Entity
@Table(name = "fee_charges", indexes = {
    @Index(name = "idx_charge_student", columnList = "student_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FeeCharge extends TenantScopedEntity {

    @Id
    @Column(name = "id", length = 96)
    private String id;

    @Column(name = "student_id", nullable = false, length = 64)
    private String studentId;

    @Column(name = "category", nullable = false, length = 32)
    private String category;

    @Column(name = "instalment", nullable = false)
    private Integer instalment;

    @Column(name = "label", nullable = false, length = 128)
    private String label;

    @Column(name = "amount", nullable = false)
    private Long amount;

    @Column(name = "due_on", nullable = false, length = 10)
    private String dueOn;

    /** The academic year this charge belongs to. Null only on rows created before V13 (read as the current year). */
    @Column(name = "academic_year_id", length = 64)
    private String academicYearId;
}
