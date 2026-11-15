package com.futureschool.backend.repository;

import com.futureschool.backend.entity.ClassSubjectTeacher;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ClassSubjectTeacherRepository extends JpaRepository<ClassSubjectTeacher, String> {
    java.util.List<ClassSubjectTeacher> findByClassIdOrderByIdAsc(String classId);
    java.util.List<ClassSubjectTeacher> findByStaffId(String staffId);
}
