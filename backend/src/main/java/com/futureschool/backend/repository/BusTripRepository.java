package com.futureschool.backend.repository;

import com.futureschool.backend.entity.BusTrip;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface BusTripRepository extends JpaRepository<BusTrip, String> {

    Optional<BusTrip> findFirstByRouteIdAndStatus(String routeId, String status);

    List<BusTrip> findByStatus(String status);
}
