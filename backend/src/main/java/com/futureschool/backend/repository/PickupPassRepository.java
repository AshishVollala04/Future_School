package com.futureschool.backend.repository;

import com.futureschool.backend.entity.PickupPass;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface PickupPassRepository extends JpaRepository<PickupPass, String> {
}
