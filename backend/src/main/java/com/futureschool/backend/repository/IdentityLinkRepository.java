package com.futureschool.backend.repository;

import com.futureschool.backend.entity.IdentityLink;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface IdentityLinkRepository extends JpaRepository<IdentityLink, String> {
    Optional<IdentityLink> findByProviderAndSubject(String provider, String subject);
}
