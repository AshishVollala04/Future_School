package com.futureschool.backend.repository;

import com.futureschool.backend.entity.MarksSheet;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface MarksSheetRepository extends JpaRepository<MarksSheet, String> {
    java.util.List<MarksSheet> findByAssessmentIdAndClassId(String assessmentId, String classId);
}
