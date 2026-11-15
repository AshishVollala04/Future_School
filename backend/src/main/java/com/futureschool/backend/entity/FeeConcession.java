package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

/** An approved reduction on one charge (sibling, scholarship, ...). Created only by an executed, Principal-approved change. School-scoped. */
@Entity
@Table(name = "fee_concessions", indexes = {
    @Index(name = "idx_concession_charge", columnList = "charge_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FeeConcession extends TenantScopedEntity {

    @Id
    @Column(name = "id", length = 96)
    private String id;

    @Column(name = "charge_id", nullable = false, length = 64)
    private String chargeId;

    @Column(name = "kind", nullable = false, length = 32)
    private String kind;

    @Column(name = "amount", nullable = false)
    private Long amount;

    @Column(name = "approved_on", nullable = false, length = 10)
    private String approvedOn;
}
