package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

/** A completed payment. Created only after provider verification (prototype: mock + step-up OTP). Never edited or deleted. School-scoped. */
@Entity
@Table(name = "fee_payments", indexes = {
    @Index(name = "idx_payment_student", columnList = "student_id"),
    @Index(name = "uk_payment_school_receipt", columnList = "school_id, receipt_no", unique = true)
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FeePayment extends TenantScopedEntity {

    @Id
    @Column(name = "id", length = 96)
    private String id;

    @Column(name = "student_id", nullable = false, length = 64)
    private String studentId;

    @Column(name = "amount", nullable = false)
    private Long amount;

    @Column(name = "method", nullable = false, length = 32)
    private String method;

    @Column(name = "provider_ref", nullable = false, length = 128)
    private String providerRef;

    @Column(name = "paid_at", nullable = false, length = 40)
    private String paidAt;

    @Column(name = "paid_by_guardian_id", length = 64)
    private String paidByGuardianId;

    @Column(name = "recorded_by_staff_id", length = 64)
    private String recordedByStaffId;

    @Column(name = "receipt_no", nullable = false, length = 64)
    private String receiptNo;

    @Column(name = "is_mock", nullable = false)
    private Boolean mock;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "fee_payment_allocations", joinColumns = @JoinColumn(name = "payment_id"))
    @Builder.Default
    private java.util.List<PaymentAllocation> allocations = new java.util.ArrayList<>();
}
