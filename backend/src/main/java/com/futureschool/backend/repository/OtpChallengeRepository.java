package com.futureschool.backend.repository;

import com.futureschool.backend.entity.OtpChallenge;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;

@Repository
public interface OtpChallengeRepository extends JpaRepository<OtpChallenge, String> {
    long countByDestinationAndCreatedAtAfter(String destination, Instant after);
}
