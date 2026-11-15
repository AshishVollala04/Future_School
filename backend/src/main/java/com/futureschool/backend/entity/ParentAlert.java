package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

/**
 * One WhatsApp/SMS alert to a parent (outbox row). School-scoped.
 *
 * Status: QUEUED -> SENT (provider accepted it) | FAILED (gave up after retries) | LOGGED (no provider
 * connected: recorded only, NOT delivered) | CANCELLED (e.g. absence corrected before sending)
 * | SKIPPED (no valid mobile, parent opted out, alerts turned off).
 */
@Entity
@Table(name = "parent_alerts", indexes = {
    @Index(name = "uk_alert_school_dedupe", columnList = "school_id, dedupe_key", unique = true),
    @Index(name = "idx_alert_status", columnList = "status, not_before")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ParentAlert extends TenantScopedEntity {

    @Id
    @Column(name = "id", length = 64)
    private String id;

    /** ABSENT or FEE_DUE. */
    @Column(name = "kind", nullable = false, length = 24)
    private String kind;

    @Column(name = "student_id", nullable = false, length = 64)
    private String studentId;

    @Column(name = "student_name", nullable = false, length = 128)
    private String studentName;

    /** 10-digit Indian mobile, or null when none was valid (then SKIPPED). */
    @Column(name = "recipient_mobile", length = 16)
    private String recipientMobile;

    /** WHATSAPP. */
    @Column(name = "channel", nullable = false, length = 16)
    private String channel;

    /** Template variables in order, as JSON array of strings. */
    @Column(name = "params_json", nullable = false, length = 1000)
    private String paramsJson;

    /** The message as the parent reads it (for the office log). */
    @Column(name = "preview", nullable = false, length = 1000)
    private String preview;

    @Column(name = "status", nullable = false, length = 16)
    private String status;

    @Column(name = "attempts", nullable = false)
    private int attempts;

    /** Epoch millis; not sent before this (gives the teacher time to fix a wrong mark). */
    @Column(name = "not_before", nullable = false)
    private long notBefore;

    @Column(name = "provider_ref", length = 128)
    private String providerRef;

    @Column(name = "error", length = 300)
    private String error;

    @Column(name = "dedupe_key", nullable = false, length = 200)
    private String dedupeKey;

    @Column(name = "created_by", nullable = false, length = 64)
    private String createdBy;

    @Column(name = "created_at", nullable = false, length = 40)
    private String createdAt;

    @Column(name = "sent_at", length = 40)
    private String sentAt;
}
