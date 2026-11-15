package com.futureschool.backend.repository;

import com.futureschool.backend.entity.FeeInstalment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface FeeInstalmentRepository extends JpaRepository<FeeInstalment, String> {
    java.util.List<FeeInstalment> findAllByOrderByNumberAsc();
}
