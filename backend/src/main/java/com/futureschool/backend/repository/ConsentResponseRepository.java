package com.futureschool.backend.repository;

import com.futureschool.backend.entity.ConsentResponse;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ConsentResponseRepository extends JpaRepository<ConsentResponse, String> {
}
