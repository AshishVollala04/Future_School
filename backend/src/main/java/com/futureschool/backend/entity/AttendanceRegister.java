package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

/** One saved register (class + date + session). Corrections append history; nothing is overwritten silently. School-scoped. */
@Entity
@Table(name = "attendance_registers")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AttendanceRegister extends TenantScopedEntity {

    @Id
    @Column(name = "id", length = 200)
    private String id;

    @Column(name = "class_id", nullable = false, length = 64)
    private String classId;

    @Column(name = "register_date", nullable = false, length = 10)
    private String date;

    @Column(name = "session", nullable = false, length = 16)
    private String session;

    @Column(name = "marks_json", nullable = false, length = 20000)
    private String marksJson;

    @Column(name = "saved_by", nullable = false, length = 64)
    private String savedBy;

    @Column(name = "saved_at", nullable = false, length = 40)
    private String savedAt;

    @Column(name = "history_json", nullable = false, length = 20000)
    private String historyJson;
}
