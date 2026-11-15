package com.futureschool.backend.repository;

import com.futureschool.backend.entity.Assessment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface AssessmentRepository extends JpaRepository<Assessment, String> {
    java.util.List<Assessment> findByStatus(String status);
}
