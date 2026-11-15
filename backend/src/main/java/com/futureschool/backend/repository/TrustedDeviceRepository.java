package com.futureschool.backend.repository;

import com.futureschool.backend.entity.TrustedDevice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface TrustedDeviceRepository extends JpaRepository<TrustedDevice, String> {
    Optional<TrustedDevice> findByTokenHash(String tokenHash);

    List<TrustedDevice> findByAccountIdAndRevokedFalseOrderByCreatedAtDesc(String accountId);
}
