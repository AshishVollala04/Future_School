package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

/** A parent-teacher conversation about one student. Parents may message only the class teacher or subject teachers. School-scoped. */
@Entity
@Table(name = "message_threads", indexes = {
    @Index(name = "idx_thread_student", columnList = "student_id"),
    @Index(name = "idx_thread_teacher", columnList = "teacher_staff_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MessageThread extends TenantScopedEntity {

    @Id
    @Column(name = "id", length = 96)
    private String id;

    @Column(name = "student_id", nullable = false, length = 64)
    private String studentId;

    @Column(name = "teacher_staff_id", nullable = false, length = 64)
    private String teacherStaffId;

    @Column(name = "teacher_name", nullable = false, length = 128)
    private String teacherName;

    @Column(name = "teacher_role", nullable = false, length = 200)
    private String teacherRole;

    @Column(name = "category", nullable = false, length = 32)
    private String category;

    @Column(name = "subject", nullable = false, length = 200)
    private String subject;

    @Column(name = "messages_json", nullable = false, length = 20000)
    private String messagesJson;

    @Column(name = "last_at", nullable = false, length = 40)
    private String lastAt;
}
