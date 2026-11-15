package com.futureschool.backend.repository;

import com.futureschool.backend.entity.ParentMeeting;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ParentMeetingRepository extends JpaRepository<ParentMeeting, String> {
}
