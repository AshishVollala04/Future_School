package com.futureschool.backend.repository;

import com.futureschool.backend.entity.TeacherLeaveRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface TeacherLeaveRequestRepository extends JpaRepository<TeacherLeaveRequest, String> {
}
