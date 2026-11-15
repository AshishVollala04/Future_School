package com.futureschool.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.*;

/** Part of a payment applied to one charge. */
@Embeddable
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class PaymentAllocation {
    @Column(name = "charge_id", nullable = false, length = 96)
    private String chargeId;

    @Column(name = "amount", nullable = false)
    private Long amount;
}
