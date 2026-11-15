package com.futureschool.backend.repository;

import com.futureschool.backend.entity.ParentAlert;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ParentAlertRepository extends JpaRepository<ParentAlert, String> {

    boolean existsByDedupeKey(String dedupeKey);

    java.util.Optional<ParentAlert> findByDedupeKey(String dedupeKey);

    java.util.List<ParentAlert> findTop50ByStatusAndNotBeforeLessThanEqualOrderByNotBeforeAsc(String status, long now);

    java.util.List<ParentAlert> findTop200ByOrderByCreatedAtDesc();
}
