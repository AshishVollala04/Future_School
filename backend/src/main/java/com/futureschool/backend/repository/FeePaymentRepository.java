package com.futureschool.backend.repository;

import com.futureschool.backend.entity.FeePayment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface FeePaymentRepository extends JpaRepository<FeePayment, String> {
    java.util.List<FeePayment> findByStudentIdOrderByPaidAtDesc(String studentId);
    boolean existsByReceiptNo(String receiptNo);
}
