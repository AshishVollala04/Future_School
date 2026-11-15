package com.futureschool.backend.repository;

import com.futureschool.backend.entity.StaffInvitation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface StaffInvitationRepository extends JpaRepository<StaffInvitation, String> {
    java.util.List<StaffInvitation> findBySchoolId(String schoolId);
}
