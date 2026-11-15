package com.futureschool.backend.repository;

import com.futureschool.backend.entity.AuthTicket;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface AuthTicketRepository extends JpaRepository<AuthTicket, String> {
}
