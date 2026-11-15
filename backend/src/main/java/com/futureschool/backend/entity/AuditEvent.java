package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

/** Append-only audit trail. There is no update or delete path. School-scoped. */
@Entity
@Table(name = "audit_events", indexes = {
    @Index(name = "idx_audit_at", columnList = "at")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuditEvent extends TenantScopedEntity {

    @Id
    @Column(name = "id", length = 200)
    private String id;

    @Column(name = "action", nullable = false, length = 64)
    private String action;

    @Column(name = "actor_id", nullable = false, length = 64)
    private String actorId;

    @Column(name = "actor_role", nullable = false, length = 32)
    private String actorRole;

    @Column(name = "target_id", nullable = false, length = 160)
    private String targetId;

    @Column(name = "details", nullable = false, length = 1000)
    private String details;

    @Column(name = "reason", length = 500)
    private String reason;

    @Column(name = "at", nullable = false, length = 40)
    private String at;
}
