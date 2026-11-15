package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

/** Which parent alerts a school sends. One row per school (id = "ALERTS-" + school id). */
@Entity
@Table(name = "alert_settings")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AlertSettings extends TenantScopedEntity {

    @Id
    @Column(name = "id", length = 80)
    private String id;

    @Column(name = "absence_alerts", nullable = false)
    private boolean absenceAlerts;

    @Column(name = "fee_reminders", nullable = false)
    private boolean feeReminders;

    @Column(name = "updated_by", length = 64)
    private String updatedBy;

    @Column(name = "updated_at", length = 40)
    private String updatedAt;
}
