package com.futureschool.backend.init;

import com.futureschool.backend.auth.OtpService;
import com.futureschool.backend.entity.SchoolClass;
import com.futureschool.backend.entity.SchoolMembership;
import com.futureschool.backend.entity.TimetableSlot;
import com.futureschool.backend.entity.UserRole;
import com.futureschool.backend.repository.*;
import com.futureschool.backend.tenant.TenantContext;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
@TestPropertySource(properties = {
        "app.seed.demo-data=false",
        "app.seed.future-school=true",
        "app.otp.fixed-code=123456"
})
@DirtiesContext
class FutureSchoolSeedTest {

    @Autowired SchoolRepository schools;
    @Autowired SchoolClassRepository classes;
    @Autowired TeacherRepository teachers;
    @Autowired StudentRepository students;
    @Autowired ClassSubjectTeacherRepository subjectTeachers;
    @Autowired TimetableSlotRepository timetable;
    @Autowired SchoolMembershipRepository memberships;
    @Autowired UserAccountRepository accounts;
    @Autowired OtpService otpService;
    @Autowired OtpChallengeRepository otpChallenges;
    @Autowired TransactionTemplate tx;

    @Test
    void seedsFutureSchoolWithExactClassTeacherSubjectAndStudentCounts() {
        var fs = schools.findById("FS").orElseThrow();
        assertEquals("Future School", fs.getName());
        assertEquals("ACTIVE", fs.getStatus());

        assertEquals(1, memberships.countBySchoolIdAndRoleAndActiveTrue("FS", UserRole.PRINCIPAL));
        assertEquals(2, memberships.countBySchoolIdAndRoleAndActiveTrue("FS", UserRole.ADMIN));

        List<SchoolMembership> teacherMembers = memberships.findBySchoolIdAndRole("FS", UserRole.TEACHER);
        assertEquals(7, teacherMembers.size());

        TenantContext.runAs("FS", () -> tx.executeWithoutResult(s -> {
            List<SchoolClass> cls = classes.findByActiveTrueOrderByGradeNumberAscSectionAsc();
            assertEquals(6, cls.size());
            var allStudents = students.findAll();
            assertEquals(180, allStudents.size());
            Set<String> classTeachers = new HashSet<>();
            for (SchoolClass c : cls) {
                classTeachers.add(c.getClassTeacherId());
                long inSection = allStudents.stream().filter(st -> c.getId().equals(st.getClassId())).count();
                assertEquals(30, inSection, "Expected 30 students in " + c.getId());
                assertEquals(7, subjectTeachers.findByClassIdOrderByIdAsc(c.getId()).size(),
                        "Expected all 7 subjects assigned in " + c.getId());
            }
            assertEquals(6, classTeachers.size(), "Expected 6 distinct class teachers");
            assertEquals(7, teachers.count());

            List<TimetableSlot> slots = timetable.findAll();
            assertEquals(252, slots.size());
            Set<String> teacherSlotKeys = new HashSet<>();
            for (TimetableSlot slot : slots) {
                assertTrue(teacherSlotKeys.add(slot.getDayOfWeek() + "#" + slot.getPeriodNumber() + "#" + slot.getTeacherId()),
                        "Clash detected for " + slot.getTeacherId() + " at " + slot.getDayOfWeek() + " P" + slot.getPeriodNumber());
            }
        }));

        var otpView = otpService.issue("SMS", "9000000001", "TEACHER_LOGIN", null);
        assertEquals("123456", otpView.devCode());
        var stored = otpChallenges.findById(otpView.challengeId()).orElseThrow();
        assertEquals("123456", stored.getDevCode());
        assertTrue(otpService.verify(otpView.challengeId(), "123456", "TEACHER_LOGIN", null).isConsumed());
    }
}
