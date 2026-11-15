package com.futureschool.backend.repository;

import com.futureschool.backend.entity.ExamWindow;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ExamWindowRepository extends JpaRepository<ExamWindow, String> {
    java.util.List<ExamWindow> findByStartsOnGreaterThanEqualOrderByStartsOnAsc(String date);
}
