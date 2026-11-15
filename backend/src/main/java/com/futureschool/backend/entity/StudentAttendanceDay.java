package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

/** Morning / afternoon attendance for one student on one school day (P, A, L or - not marked). School-scoped. */
@Entity
@Table(name = "student_attendance_days", indexes = {
    @Index(name = "uk_att_day_school_student_date", columnList = "school_id, student_id, attendance_date", unique = true)
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StudentAttendanceDay extends TenantScopedEntity {

    @Id
    @Column(name = "id", length = 96)
    private String id;

    @Column(name = "student_id", nullable = false, length = 64)
    private String studentId;

    @Column(name = "attendance_date", nullable = false, length = 10)
    private String date;

    @Column(name = "morning", nullable = false, length = 1)
    private String morning;

    @Column(name = "afternoon", nullable = false, length = 1)
    private String afternoon;
}
