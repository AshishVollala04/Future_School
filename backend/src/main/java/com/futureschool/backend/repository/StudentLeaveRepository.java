package com.futureschool.backend.repository;

import com.futureschool.backend.entity.StudentLeave;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface StudentLeaveRepository extends JpaRepository<StudentLeave, String> {
}
