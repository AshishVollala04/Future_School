package com.futureschool.backend.repository;

import com.futureschool.backend.entity.PublishedResult;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface PublishedResultRepository extends JpaRepository<PublishedResult, String> {
    java.util.List<PublishedResult> findByStudentId(String studentId);
}
