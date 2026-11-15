package com.futureschool.backend.repository;

import com.futureschool.backend.entity.AuditEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;

@Repository
public interface AuditEventRepository extends JpaRepository<AuditEvent, String> {
    List<AuditEvent> findByActionOrderByAtDesc(String action);
    List<AuditEvent> findByActionInOrderByAtDesc(Collection<String> actions);
}
