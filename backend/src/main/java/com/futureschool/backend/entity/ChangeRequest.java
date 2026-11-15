package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

/**
 * A policy-sensitive change (concession, refund, exam date, fee structure, clearance rule ...).
 * Admin drafts -> server validates -> Principal approves (OTP; approvedHash recorded)
 * -> server validates again -> Admin executes. Any edit after approval changes payloadHash and
 * blocks execution until it is approved again. School-scoped.
 */
@Entity
@Table(name = "change_requests")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChangeRequest extends TenantScopedEntity {

    @Id
    @Column(name = "id", length = 96)
    private String id;

    @Column(name = "kind", nullable = false, length = 32)
    private String kind;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "payload_json", nullable = false, length = 4000)
    private String payloadJson;

    @Column(name = "payload_hash", nullable = false, length = 64)
    private String payloadHash;

    @Column(name = "approved_hash", length = 64)
    private String approvedHash;

    @Column(name = "status", nullable = false, length = 24)
    private String status;

    @Column(name = "prepared_by", nullable = false, length = 64)
    private String preparedBy;

    @Column(name = "prepared_by_name", nullable = false, length = 128)
    private String preparedByName;

    @Column(name = "history_json", nullable = false, length = 20000)
    private String historyJson;
}
