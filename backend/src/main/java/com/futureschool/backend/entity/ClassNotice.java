package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

/** A notice for the whole school (audience ALL) or for listed classes. School-scoped. */
@Entity
@Table(name = "class_notices")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ClassNotice extends TenantScopedEntity {

    @Id
    @Column(name = "id", length = 96)
    private String id;

    @Column(name = "audience_csv", nullable = false, length = 1000)
    private String audienceCsv;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "body", nullable = false, length = 2000)
    private String body;

    @Column(name = "priority", nullable = false, length = 16)
    private String priority;

    @Column(name = "published_at", nullable = false, length = 40)
    private String publishedAt;

    @Column(name = "published_by", nullable = false, length = 64)
    private String publishedBy;
}
