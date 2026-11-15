package com.futureschool.backend.repository;

import com.futureschool.backend.entity.LoginSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface LoginSessionRepository extends JpaRepository<LoginSession, String> {
    List<LoginSession> findByMembershipIdAndRevokedFalse(String membershipId);
}
