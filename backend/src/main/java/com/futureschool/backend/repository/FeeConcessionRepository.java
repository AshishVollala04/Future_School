package com.futureschool.backend.repository;

import com.futureschool.backend.entity.FeeConcession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface FeeConcessionRepository extends JpaRepository<FeeConcession, String> {
    java.util.List<FeeConcession> findByChargeIdIn(java.util.Collection<String> chargeIds);
}
