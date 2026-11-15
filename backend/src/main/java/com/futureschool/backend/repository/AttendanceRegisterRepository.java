package com.futureschool.backend.repository;

import com.futureschool.backend.entity.AttendanceRegister;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface AttendanceRegisterRepository extends JpaRepository<AttendanceRegister, String> {

    java.util.List<AttendanceRegister> findByDate(String date);
}
