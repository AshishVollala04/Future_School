package com.futureschool.backend.repository;

import com.futureschool.backend.entity.FeeCharge;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface FeeChargeRepository extends JpaRepository<FeeCharge, String> {
    java.util.List<FeeCharge> findByStudentIdOrderByDueOnAscIdAsc(String studentId);
}
