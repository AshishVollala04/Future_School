package com.futureschool.backend.repository;

import com.futureschool.backend.entity.AlertOptOut;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface AlertOptOutRepository extends JpaRepository<AlertOptOut, String> {
}
