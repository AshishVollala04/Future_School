package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

/** A parent request to start, change or stop transport. Admin (TRANSPORT) decides; seats re-checked at approval. School-scoped. */
@Entity
@Table(name = "transport_requests")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TransportRequest extends TenantScopedEntity {

    @Id
    @Column(name = "id", length = 96)
    private String id;

    @Column(name = "student_id", nullable = false, length = 64)
    private String studentId;

    @Column(name = "requested_by_guardian_id", nullable = false, length = 64)
    private String requestedByGuardianId;

    @Column(name = "kind", nullable = false, length = 8)
    private String kind;

    @Column(name = "from_route_id", length = 64)
    private String fromRouteId;

    @Column(name = "to_route_id", length = 64)
    private String toRouteId;

    @Column(name = "stop_name", length = 128)
    private String stopName;

    @Column(name = "reason", nullable = false, length = 300)
    private String reason;

    @Column(name = "effective_from", nullable = false, length = 10)
    private String effectiveFrom;

    @Column(name = "status", nullable = false, length = 16)
    private String status;

    @Column(name = "created_at", nullable = false, length = 40)
    private String createdAt;

    @Column(name = "decided_by", length = 64)
    private String decidedBy;

    @Column(name = "decided_at", length = 40)
    private String decidedAt;

    @Column(name = "decision_note", length = 300)
    private String decisionNote;
}
