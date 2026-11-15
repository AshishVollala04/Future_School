package com.futureschool.backend.service;

import com.futureschool.backend.entity.Teacher;
import com.futureschool.backend.entity.UserAccount;
import com.futureschool.backend.entity.UserRole;
import com.futureschool.backend.repository.SchoolMembershipRepository;
import com.futureschool.backend.repository.TeacherRepository;
import com.futureschool.backend.repository.UserAccountRepository;
import com.futureschool.backend.tenant.TenantContext;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class TeacherService {

    private final TeacherRepository teacherRepository;
    private final UserAccountRepository userAccountRepository;
    private final SchoolMembershipRepository schoolMembershipRepository;
    private final MembershipService membershipService;
    private final PasswordEncoder passwordEncoder;

    public TeacherService(
            MembershipService membershipService,
            TeacherRepository teacherRepository,
            UserAccountRepository userAccountRepository,
            SchoolMembershipRepository schoolMembershipRepository,
            PasswordEncoder passwordEncoder
    ) {
        this.membershipService = membershipService;
        this.teacherRepository = teacherRepository;
        this.userAccountRepository = userAccountRepository;
        this.schoolMembershipRepository = schoolMembershipRepository;
        this.passwordEncoder = passwordEncoder;
    }

    public List<Teacher> getAllTeachers() {
        return teacherRepository.findAll();
    }

    public Optional<Teacher> getTeacherById(String id) {
        Optional<Teacher> t = teacherRepository.findById(id);
        if (t.isPresent()) return t;
        return teacherRepository.findByTeacherIdIgnoreCase(id);
    }

    @Transactional
    public Teacher createTeacher(Teacher teacher, String initialPassword) {
        String school = TenantContext.require();
        if (teacher.getTeacherId() == null || teacher.getTeacherId().isBlank()) {
            long seq = teacherRepository.count() + 1;
            String candidate = "TCH-" + school + "-" + String.format("%04d", seq);
            while (teacherRepository.findByTeacherIdIgnoreCase(candidate).isPresent()) {
                candidate = "TCH-" + school + "-" + String.format("%04d", ++seq);
            }
            teacher.setTeacherId(candidate);
        }
        if (teacher.getId() == null || teacher.getId().isBlank()) {
            teacher.setId(school + "-" + teacher.getTeacherId());
        }

        Teacher saved = teacherRepository.save(teacher);

        // Auto-create teacher login account
        if (!userAccountRepository.existsByLoginIdIgnoreCase(saved.getTeacherId())) {
            String pwd = (initialPassword != null && !initialPassword.isBlank()) ? initialPassword : membershipService.unusablePassword();
            UserAccount account = UserAccount.builder()
                    .id("USR-" + saved.getTeacherId())
                    .loginId(saved.getTeacherId())
                    .password(passwordEncoder.encode(pwd))
                    .name(saved.getName())
                    .email(saved.getEmail())
                    .role(UserRole.TEACHER)
                    .teacherId(saved.getTeacherId())
                    .status("Active")
                    .active(true)
                    .build();
            userAccountRepository.save(account);
        }
        // Access to THIS school (also for an account that already exists in another school).
        userAccountRepository.findByLoginIdIgnoreCase(saved.getTeacherId())
                .ifPresent(acc -> membershipService.ensure(acc, UserRole.TEACHER, saved.getDesignation()));

        return saved;
    }

    @Transactional
    public Teacher updateTeacher(String id, Teacher updated) {
        Teacher existing = getTeacherById(id)
                .orElseThrow(() -> new RuntimeException("Teacher not found with ID: " + id));
        String school = TenantContext.require();

        existing.setName(updated.getName());
        existing.setEmail(updated.getEmail());
        existing.setPhone(updated.getPhone());
        existing.setDesignation(updated.getDesignation());
        existing.setQualification(updated.getQualification());
        existing.setPrimarySubject(updated.getPrimarySubject());
        existing.setActive(updated.isActive());

        // Update corresponding user account name/email only if member of this school
        userAccountRepository.findByLoginIdIgnoreCase(existing.getTeacherId())
                .filter(acc -> schoolMembershipRepository.existsByAccountIdAndSchoolIdAndRole(acc.getId(), school, UserRole.TEACHER))
                .ifPresent(acc -> {
                    acc.setName(updated.getName());
                    acc.setEmail(updated.getEmail());
                    acc.setActive(updated.isActive());
                    userAccountRepository.save(acc);
                });

        return teacherRepository.save(existing);
    }

    @Transactional
    public void deleteTeacher(String id) {
        Teacher existing = getTeacherById(id)
                .orElseThrow(() -> new RuntimeException("Teacher not found with ID: " + id));
        String school = TenantContext.require();
        userAccountRepository.findByLoginIdIgnoreCase(existing.getTeacherId())
                .ifPresent(acc -> schoolMembershipRepository.findBySchoolId(school).stream()
                        .filter(m -> m.getAccountId().equals(acc.getId()))
                        .forEach(m -> {
                            m.setActive(false);
                            schoolMembershipRepository.save(m);
                        }));
        existing.setActive(false);
        teacherRepository.save(existing);
    }
}
