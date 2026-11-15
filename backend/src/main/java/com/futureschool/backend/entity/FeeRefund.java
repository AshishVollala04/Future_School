package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

/** A refund is its own record; the original payment is kept unchanged. School-scoped. */
@Entity
@Table(name = "fee_refunds")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FeeRefund extends TenantScopedEntity {

    @Id
    @Column(name = "id", length = 96)
    private String id;

    @Column(name = "payment_id", nullable = false, length = 64)
    private String paymentId;

    @Column(name = "amount", nullable = false)
    private Long amount;

    @Column(name = "reason", nullable = false, length = 300)
    private String reason;

    @Column(name = "status", nullable = false, length = 16)
    private String status;

    @Column(name = "created_at", nullable = false, length = 40)
    private String createdAt;
}
