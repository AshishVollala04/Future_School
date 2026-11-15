package com.futureschool.backend.repository;

import com.futureschool.backend.entity.IdpLoginState;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface IdpLoginStateRepository extends JpaRepository<IdpLoginState, String> {
}
