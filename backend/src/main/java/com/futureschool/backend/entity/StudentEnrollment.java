package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

/**
 * One student's place in one academic year: class, section and roll number, and how the year ended.
 * Rows are never deleted or rewritten when a new year starts, so past-year class assignments stay
 * as they were. The Student row keeps the CURRENT class for the rest of the app.
 *
 * outcome (for the year this row belongs to):
 *   ENROLLED  attending (or planned to attend) this year
 *   PROMOTED  finished this year, moves up a grade next year
 *   REPEATED  finished this year, stays in the same grade next year
 *   EXITED    left the school at the end of (or during) this year
 */
@Entity
@Table(name = "student_enrollments", indexes = {
    @Index(name = "uk_enrollment_student_year", columnList = "school_id, student_id, academic_year_id", unique = true),
    @Index(name = "idx_enrollment_year_class", columnList = "school_id, academic_year_id, class_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StudentEnrollment extends TenantScopedEntity {
    @Id
    @Column(name = "id", length = 160)
    private String id;

    @Column(name = "student_id", nullable = false, length = 64)
    private String studentId;

    @Column(name = "academic_year_id", nullable = false, length = 64)
    private String academicYearId;

    @Column(name = "class_id", nullable = false, length = 64)
    private String classId;

    @Column(name = "class_name", nullable = false, length = 64)
    private String className;

    @Column(name = "section", nullable = false, length = 16)
    private String section;

    @Column(name = "roll", nullable = false, length = 16)
    private String roll;

    @Column(name = "outcome", nullable = false, length = 16)
    @Builder.Default
    private String outcome = "ENROLLED";

    /** NEW (joined this year), RETURNING, or SNAPSHOT (recorded from the existing roster). */
    @Column(name = "source", nullable = false, length = 16)
    @Builder.Default
    private String source = "RETURNING";

    @Column(name = "exit_date", length = 10)
    private String exitDate;

    @Column(name = "exit_reason", length = 255)
    private String exitReason;

    @Column(name = "created_at", nullable = false, length = 40)
    private String createdAt;

    @Column(name = "created_by", length = 64)
    private String createdBy;
}
