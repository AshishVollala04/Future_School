package com.futureschool.backend.service;

import com.futureschool.backend.entity.Parent;
import com.futureschool.backend.entity.Student;
import com.futureschool.backend.entity.UserAccount;
import com.futureschool.backend.entity.UserRole;
import com.futureschool.backend.repository.ParentRepository;
import com.futureschool.backend.repository.SchoolMembershipRepository;
import com.futureschool.backend.repository.StudentRepository;
import com.futureschool.backend.repository.UserAccountRepository;
import com.futureschool.backend.tenant.TenantContext;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Service
public class ParentService {

    private final ParentRepository parentRepository;
    private final StudentRepository studentRepository;
    private final UserAccountRepository userAccountRepository;
    private final SchoolMembershipRepository schoolMembershipRepository;
    private final MembershipService membershipService;
    private final PasswordEncoder passwordEncoder;

    public ParentService(
            MembershipService membershipService,
            ParentRepository parentRepository,
            StudentRepository studentRepository,
            UserAccountRepository userAccountRepository,
            SchoolMembershipRepository schoolMembershipRepository,
            PasswordEncoder passwordEncoder
    ) {
        this.membershipService = membershipService;
        this.parentRepository = parentRepository;
        this.studentRepository = studentRepository;
        this.userAccountRepository = userAccountRepository;
        this.schoolMembershipRepository = schoolMembershipRepository;
        this.passwordEncoder = passwordEncoder;
    }

    public List<Parent> getAllParents() {
        return parentRepository.findAll();
    }

    public Optional<Parent> getParentById(String id) {
        Optional<Parent> p = parentRepository.findById(id);
        if (p.isPresent()) return p;
        return parentRepository.findByLoginIdIgnoreCase(id);
    }

    @Transactional
    public Parent createParent(Parent parent, String initialPassword) {
        String school = TenantContext.require();
        if (parent.getLoginId() == null || parent.getLoginId().isBlank()) {
            long seq = parentRepository.count() + 1;
            String candidate = "PAR-" + school + "-" + String.format("%04d", seq);
            while (parentRepository.findByLoginIdIgnoreCase(candidate).isPresent() || userAccountRepository.existsByLoginIdIgnoreCase(candidate)) {
                candidate = "PAR-" + school + "-" + String.format("%04d", ++seq);
            }
            parent.setLoginId(candidate);
        }
        if (parent.getId() == null || parent.getId().isBlank()) {
            parent.setId(school + "-" + parent.getLoginId());
        }

        Parent saved = parentRepository.save(parent);

        // Auto-create parent user account
        if (!userAccountRepository.existsByLoginIdIgnoreCase(saved.getLoginId())) {
            String pwd = (initialPassword != null && !initialPassword.isBlank()) ? initialPassword : membershipService.unusablePassword();
            UserAccount account = UserAccount.builder()
                    .id("USR-" + saved.getLoginId())
                    .loginId(saved.getLoginId())
                    .password(passwordEncoder.encode(pwd))
                    .name(saved.getName())
                    .mobile(saved.getMobile())
                    .email(saved.getEmail())
                    .role(UserRole.PARENT)
                    .status("Active")
                    .active(true)
                    .linkedStudentIds(new ArrayList<>())
                    .build();
            userAccountRepository.save(account);
        }
        // Access to THIS school (also for an account that already exists in another school).
        userAccountRepository.findByLoginIdIgnoreCase(saved.getLoginId())
                .ifPresent(acc -> membershipService.ensure(acc, UserRole.PARENT, "Parent / Guardian"));

        return saved;
    }

    @Transactional
    public Parent updateParent(String id, Parent updated) {
        Parent existing = getParentById(id)
                .orElseThrow(() -> new RuntimeException("Parent not found with ID: " + id));
        String school = TenantContext.require();

        existing.setName(updated.getName());
        existing.setMobile(updated.getMobile());
        existing.setEmail(updated.getEmail());
        existing.setOccupation(updated.getOccupation());
        existing.setAddress(updated.getAddress());

        userAccountRepository.findByLoginIdIgnoreCase(existing.getLoginId())
                .filter(acc -> schoolMembershipRepository.existsByAccountIdAndSchoolIdAndRole(acc.getId(), school, UserRole.PARENT))
                .ifPresent(acc -> {
                    acc.setName(updated.getName());
                    acc.setEmail(updated.getEmail());
                    userAccountRepository.save(acc);
                });

        return parentRepository.save(existing);
    }

    @Transactional
    public void linkStudentToParent(String parentLoginId, String studentId) {
        String school = TenantContext.require();
        Parent parent = getParentById(parentLoginId)
                .orElseThrow(() -> new RuntimeException("Parent not found: " + parentLoginId));

        Student student = studentRepository.findById(studentId)
                .orElseThrow(() -> new RuntimeException("Student not found: " + studentId));

        // Update student's parent link
        student.setParentAccountId(parent.getLoginId());
        student.setParentName(parent.getName());
        student.setParentMobile(parent.getMobile());
        student.setParentEmail(parent.getEmail());
        studentRepository.save(student);

        // Update parent user account's linked student IDs list (only if member of this school)
        userAccountRepository.findByLoginIdIgnoreCase(parent.getLoginId())
                .filter(acc -> schoolMembershipRepository.existsByAccountIdAndSchoolIdAndRole(acc.getId(), school, UserRole.PARENT))
                .ifPresent(acc -> {
                    if (!acc.getLinkedStudentIds().contains(studentId)) {
                        acc.getLinkedStudentIds().add(studentId);
                        userAccountRepository.save(acc);
                    }
                });
    }

    @Transactional
    public void deleteParent(String id) {
        Parent existing = getParentById(id)
                .orElseThrow(() -> new RuntimeException("Parent not found with ID: " + id));
        String school = TenantContext.require();
        userAccountRepository.findByLoginIdIgnoreCase(existing.getLoginId())
                .ifPresent(acc -> schoolMembershipRepository.findBySchoolId(school).stream()
                        .filter(m -> m.getAccountId().equals(acc.getId()) && m.getRole() == UserRole.PARENT)
                        .forEach(m -> {
                            m.setActive(false);
                            schoolMembershipRepository.save(m);
                        }));
    }
}
