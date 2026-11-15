package com.futureschool.backend.repository;

import com.futureschool.backend.entity.ConsentForm;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ConsentFormRepository extends JpaRepository<ConsentForm, String> {
}
