package com.futureschool.backend.repository;

import com.futureschool.backend.entity.UserAccount;
import com.futureschool.backend.entity.UserRole;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UserAccountRepository extends JpaRepository<UserAccount, String> {
    Optional<UserAccount> findByLoginIdIgnoreCase(String loginId);
    boolean existsByLoginIdIgnoreCase(String loginId);
    List<UserAccount> findByRole(UserRole role);
    List<UserAccount> findByMobile(String mobile);
    Optional<UserAccount> findByEmailIgnoreCase(String email);

    // PIN tries are counted in the database, atomically: a guess first takes one of the tries, so
    // parallel guesses cannot share one (no lost update). See SignInService.checkPin.
    @Modifying(flushAutomatically = true)
    @Query("update UserAccount x set x.pinFailedAttempts = x.pinFailedAttempts + 1 where x.id = :id and x.pinFailedAttempts < :max")
    int reservePinTry(@Param("id") String id, @Param("max") int max);

    @Query("select x.pinFailedAttempts from UserAccount x where x.id = :id")
    int pinTriesUsed(@Param("id") String id);

    @Modifying(flushAutomatically = true)
    @Query("update UserAccount x set x.pinFailedAttempts = 0 where x.id = :id")
    int clearPinTries(@Param("id") String id);
}
