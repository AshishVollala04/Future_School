package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

/** A parent complaint. Admin (COMPLAINTS) replies / resolves; the parent confirms or reopens. Safety goes to the Principal. Never deleted. School-scoped. */
@Entity
@Table(name = "complaint_cases")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ComplaintCase extends TenantScopedEntity {

    @Id
    @Column(name = "id", length = 96)
    private String id;

    @Column(name = "student_id", nullable = false, length = 64)
    private String studentId;

    @Column(name = "raised_by_guardian_id", nullable = false, length = 64)
    private String raisedByGuardianId;

    @Column(name = "raised_by_name", nullable = false, length = 128)
    private String raisedByName;

    @Column(name = "category", nullable = false, length = 16)
    private String category;

    @Column(name = "subject", nullable = false, length = 120)
    private String subject;

    @Column(name = "description", nullable = false, length = 1000)
    private String description;

    @Column(name = "status", nullable = false, length = 16)
    private String status;

    @Column(name = "created_at", nullable = false, length = 40)
    private String createdAt;

    @Column(name = "principal_informed", nullable = false)
    private Boolean principalInformed;

    @Column(name = "log_json", nullable = false, length = 20000)
    private String logJson;
}
