package com.futureschool.backend.repository;

import com.futureschool.backend.entity.TransportRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface TransportRequestRepository extends JpaRepository<TransportRequest, String> {
}
