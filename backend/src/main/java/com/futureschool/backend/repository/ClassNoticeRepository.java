package com.futureschool.backend.repository;

import com.futureschool.backend.entity.ClassNotice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ClassNoticeRepository extends JpaRepository<ClassNotice, String> {
}
