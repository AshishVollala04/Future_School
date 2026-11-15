package com.futureschool.backend.repository;

import com.futureschool.backend.entity.FeeRefund;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface FeeRefundRepository extends JpaRepository<FeeRefund, String> {
    java.util.List<FeeRefund> findByPaymentIdIn(java.util.Collection<String> paymentIds);
}
