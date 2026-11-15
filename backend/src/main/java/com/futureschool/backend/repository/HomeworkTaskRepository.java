package com.futureschool.backend.repository;

import com.futureschool.backend.entity.HomeworkTask;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface HomeworkTaskRepository extends JpaRepository<HomeworkTask, String> {
}
