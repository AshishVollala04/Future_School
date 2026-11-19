package com.futureschool.backend.repository;

import com.futureschool.backend.entity.StudentEnrollment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface StudentEnrollmentRepository extends JpaRepository<StudentEnrollment, String> {
    Optional<StudentEnrollment> findByStudentIdAndAcademicYearId(String studentId, String academicYearId);

    List<StudentEnrollment> findByAcademicYearId(String academicYearId);

    List<StudentEnrollment> findByStudentIdOrderByCreatedAtAsc(String studentId);
}
