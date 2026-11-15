package com.futureschool.backend.repository;

import com.futureschool.backend.entity.HallTicketRelease;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface HallTicketReleaseRepository extends JpaRepository<HallTicketRelease, String> {
    java.util.Optional<HallTicketRelease> findByExamIdAndStudentId(String examId, String studentId);
}
