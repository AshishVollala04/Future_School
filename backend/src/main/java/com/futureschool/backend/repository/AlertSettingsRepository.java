package com.futureschool.backend.repository;

import com.futureschool.backend.entity.AlertSettings;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface AlertSettingsRepository extends JpaRepository<AlertSettings, String> {
}
