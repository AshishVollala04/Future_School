package com.futureschool.backend.repository;

import com.futureschool.backend.entity.StudentAttendanceDay;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface StudentAttendanceDayRepository extends JpaRepository<StudentAttendanceDay, String> {
    java.util.List<StudentAttendanceDay> findByStudentIdAndDateGreaterThanEqualOrderByDateAsc(String studentId, String from);

    java.util.List<StudentAttendanceDay> findByDate(String date);
}
