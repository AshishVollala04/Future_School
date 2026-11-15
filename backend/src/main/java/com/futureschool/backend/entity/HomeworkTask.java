package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

/** Homework for one class + subject, posted by its Subject Teacher. Per-student status kept as JSON. School-scoped. */
@Entity
@Table(name = "homework_tasks", indexes = {
    @Index(name = "idx_hw_task_class", columnList = "class_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class HomeworkTask extends TenantScopedEntity {

    @Id
    @Column(name = "id", length = 96)
    private String id;

    @Column(name = "class_id", nullable = false, length = 64)
    private String classId;

    @Column(name = "subject", nullable = false, length = 64)
    private String subject;

    @Column(name = "teacher_staff_id", nullable = false, length = 64)
    private String teacherStaffId;

    @Column(name = "teacher_name", nullable = false, length = 128)
    private String teacherName;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "instructions", nullable = false, length = 1000)
    private String instructions;

    @Column(name = "assigned_on", nullable = false, length = 10)
    private String assignedOn;

    @Column(name = "due_on", nullable = false, length = 10)
    private String dueOn;

    @Column(name = "submission_type", nullable = false, length = 16)
    private String submissionType;

    @Column(name = "status_json", nullable = false, length = 20000)
    private String statusJson;
}
