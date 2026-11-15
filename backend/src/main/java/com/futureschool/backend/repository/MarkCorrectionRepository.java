package com.futureschool.backend.repository;

import com.futureschool.backend.entity.MarkCorrection;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface MarkCorrectionRepository extends JpaRepository<MarkCorrection, String> {
}
