package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

/**
 * Server-computed amount + allocation for a pending fee payment (mock or Razorpay).
 * Expires in 15 minutes; single use. School-scoped.
 */
@Entity
@Table(name = "fee_payment_orders", indexes = {
    @Index(name = "idx_order_provider_id", columnList = "provider_order_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PaymentOrder extends TenantScopedEntity {

    @Id
    @Column(name = "id", length = 96)
    private String id;

    @Column(name = "student_id", nullable = false, length = 64)
    private String studentId;

    @Column(name = "session_id", nullable = false, length = 64)
    private String sessionId;

    @Column(name = "amount", nullable = false)
    private Long amount;

    @Column(name = "allocations_json", nullable = false, length = 4000)
    private String allocationsJson;

    @Convert(converter = InstantMillisConverter.class)
    @Column(name = "expires_at", nullable = false)
    private java.time.Instant expiresAt;

    @Column(name = "consumed", nullable = false)
    private Boolean consumed;

    @Builder.Default
    @Column(name = "provider", nullable = false, length = 24)
    private String provider = "mock";

    @Column(name = "provider_order_id", length = 128)
    private String providerOrderId;

    @Builder.Default
    @Column(name = "step_up_verified", nullable = false)
    private Boolean stepUpVerified = false;

    @Column(name = "payment_id", length = 96)
    private String paymentId;
}
