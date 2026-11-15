package com.futureschool.backend.repository;

import com.futureschool.backend.entity.ReportCard;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ReportCardRepository extends JpaRepository<ReportCard, String> {
    java.util.List<ReportCard> findByAssessmentIdAndClassId(String assessmentId, String classId);
    java.util.List<ReportCard> findByStatusNot(String status);
}
