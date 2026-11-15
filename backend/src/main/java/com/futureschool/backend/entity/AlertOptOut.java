package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

/** A parent account that turned WhatsApp alerts off (id = "OPT-" + account id). School-scoped. */
@Entity
@Table(name = "alert_opt_outs")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AlertOptOut extends TenantScopedEntity {

    @Id
    @Column(name = "id", length = 80)
    private String id;

    @Column(name = "account_id", nullable = false, length = 64)
    private String accountId;

    @Column(name = "created_at", nullable = false, length = 40)
    private String createdAt;
}
