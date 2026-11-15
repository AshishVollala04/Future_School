package com.futureschool.backend.repository;

import com.futureschool.backend.entity.MessageThread;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface MessageThreadRepository extends JpaRepository<MessageThread, String> {
}
