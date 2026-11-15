package com.futureschool.backend.repository;

import com.futureschool.backend.entity.ComplaintCase;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ComplaintCaseRepository extends JpaRepository<ComplaintCase, String> {
}
