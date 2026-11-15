package com.futureschool.backend.repository;

import com.futureschool.backend.entity.BusTrackerLink;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface BusTrackerLinkRepository extends JpaRepository<BusTrackerLink, String> {

    Optional<BusTrackerLink> findByTokenHashAndRevokedFalse(String tokenHash);

    List<BusTrackerLink> findBySchoolIdAndRouteIdAndRevokedFalse(String schoolId, String routeId);
}
