package com.futureschool.backend.repository;

import com.futureschool.backend.entity.SchoolMembership;
import com.futureschool.backend.entity.UserRole;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SchoolMembershipRepository extends JpaRepository<SchoolMembership, String> {
    List<SchoolMembership> findByAccountIdAndActiveTrue(String accountId);
    Optional<SchoolMembership> findByIdAndAccountId(String id, String accountId);
    List<SchoolMembership> findBySchoolId(String schoolId);
    List<SchoolMembership> findBySchoolIdAndRole(String schoolId, UserRole role);
    boolean existsByAccountIdAndSchoolIdAndRole(String accountId, String schoolId, UserRole role);
    long countBySchoolIdAndRoleAndActiveTrue(String schoolId, UserRole role);

    // PIN tries are counted in the database, atomically: a guess first takes one of the tries, so
    // parallel guesses cannot share one (no lost update). See SignInService.checkPin.
    @Modifying(flushAutomatically = true)
    @Query("update SchoolMembership x set x.pinFailedAttempts = x.pinFailedAttempts + 1 where x.id = :id and x.pinFailedAttempts < :max")
    int reservePinTry(@Param("id") String id, @Param("max") int max);

    @Query("select x.pinFailedAttempts from SchoolMembership x where x.id = :id")
    int pinTriesUsed(@Param("id") String id);

    @Modifying(flushAutomatically = true)
    @Query("update SchoolMembership x set x.pinFailedAttempts = 0 where x.id = :id")
    int clearPinTries(@Param("id") String id);
}
