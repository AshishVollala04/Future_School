package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

/** A consent request for listed classes, with a response window. School-scoped. */
@Entity
@Table(name = "consent_forms")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ConsentForm extends TenantScopedEntity {

    @Id
    @Column(name = "id", length = 96)
    private String id;

    @Column(name = "class_ids_csv", nullable = false, length = 1000)
    private String classIdsCsv;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "details", nullable = false, length = 2000)
    private String details;

    @Column(name = "due_on", nullable = false, length = 10)
    private String dueOn;
}
