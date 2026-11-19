package com.futureschool.backend.service;

import com.futureschool.backend.entity.FeeCharge;
import com.futureschool.backend.entity.FeeInstalment;
import com.futureschool.backend.entity.Parent;
import com.futureschool.backend.entity.Student;
import com.futureschool.backend.entity.UserAccount;
import com.futureschool.backend.entity.UserRole;
import com.futureschool.backend.repository.FeeChargeRepository;
import com.futureschool.backend.repository.FeeInstalmentRepository;
import com.futureschool.backend.repository.ParentRepository;
import com.futureschool.backend.repository.SchoolMembershipRepository;
import com.futureschool.backend.repository.StudentRepository;
import com.futureschool.backend.repository.UserAccountRepository;
import com.futureschool.backend.roster.AcademicYearService;
import com.futureschool.backend.tenant.TenantContext;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Year;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Service
public class StudentService {

    private final StudentRepository studentRepository;
    private final UserAccountRepository userAccountRepository;
    private final SchoolMembershipRepository schoolMembershipRepository;
    private final MembershipService membershipService;
    private final ParentRepository parentRepository;
    private final FeeInstalmentRepository instalmentRepository;
    private final FeeChargeRepository chargeRepository;
    private final PasswordEncoder passwordEncoder;
    private final AcademicYearService academicYears;

    public StudentService(
            MembershipService membershipService,
            StudentRepository studentRepository,
            UserAccountRepository userAccountRepository,
            SchoolMembershipRepository schoolMembershipRepository,
            ParentRepository parentRepository,
            FeeInstalmentRepository instalmentRepository,
            FeeChargeRepository chargeRepository,
            PasswordEncoder passwordEncoder,
            AcademicYearService academicYears
    ) {
        this.academicYears = academicYears;
        this.membershipService = membershipService;
        this.studentRepository = studentRepository;
        this.userAccountRepository = userAccountRepository;
        this.schoolMembershipRepository = schoolMembershipRepository;
        this.parentRepository = parentRepository;
        this.instalmentRepository = instalmentRepository;
        this.chargeRepository = chargeRepository;
        this.passwordEncoder = passwordEncoder;
    }

    public List<Student> getAllStudents() {
        return studentRepository.findAll();
    }

    public Optional<Student> getStudentById(String id) {
        Optional<Student> s = studentRepository.findById(id);
        if (s.isPresent()) return s;
        return studentRepository.findByAdmissionNumber(id);
    }

    public List<Student> getStudentsByClassId(String classId) {
        return studentRepository.findByClassIdOrderByRollAsc(classId);
    }

    public List<Student> getStudentsByParentAccountId(String parentAccountId) {
        return studentRepository.findByParentAccountId(parentAccountId);
    }

    public List<Student> getStudentsByIds(List<String> ids) {
        return studentRepository.findByIdIn(ids);
    }

    public List<Student> searchStudents(String query) {
        if (query == null || query.trim().isEmpty()) {
            return studentRepository.findAll();
        }
        return studentRepository.searchStudents(query.trim());
    }

    @Transactional
    public Student createStudent(Student student, String initialPassword) {
        String school = TenantContext.require();
        // Safe to retry: the admission number identifies a student in a school, so a repeated "add" is refused, not duplicated.
        if (student.getAdmissionNumber() != null && !student.getAdmissionNumber().isBlank()
                && studentRepository.findByAdmissionNumber(student.getAdmissionNumber().trim()).isPresent()) {
            throw com.futureschool.backend.teaching.Teaching.rule("DUPLICATE_ADMISSION",
                    "A student with admission number " + student.getAdmissionNumber().trim() + " already exists.");
        }
        if (student.getId() == null || student.getId().isBlank()) {
            int year = Year.now().getValue();
            long seq = studentRepository.count() + 1;
            String candidate = school + "-" + year + "-" + String.format("%04d", seq);
            while (studentRepository.existsById(candidate) || userAccountRepository.existsByLoginIdIgnoreCase(candidate)) {
                candidate = school + "-" + year + "-" + String.format("%04d", ++seq);
            }
            student.setId(candidate);
        }
        if (student.getAdmissionNumber() == null || student.getAdmissionNumber().isBlank()) {
            student.setAdmissionNumber("ADM-" + student.getId());
        }
        if (student.getStatus() == null || student.getStatus().isBlank()) {
            student.setStatus("Active");
        }

        // If parentAccountId is supplied, try to sync parent details; if only parentMobile is supplied, find/create parent!
        if (student.getParentAccountId() != null && !student.getParentAccountId().isBlank()) {
            parentRepository.findByLoginIdIgnoreCase(student.getParentAccountId()).ifPresent(p -> {
                if (student.getParentName() == null) student.setParentName(p.getName());
                if (student.getParentMobile() == null) student.setParentMobile(p.getMobile());
                if (student.getParentEmail() == null) student.setParentEmail(p.getEmail());
                if (student.getAddress() == null) student.setAddress(p.getAddress());
            });
        } else if (student.getParentMobile() != null && !student.getParentMobile().isBlank()) {
            String digits = student.getParentMobile().replaceAll("\\D", "");
            if (digits.length() > 10) digits = digits.substring(digits.length() - 10);
            if (digits.length() == 10) {
                final String mobile10 = digits;
                UserAccount parentAcc = userAccountRepository.findByMobile(mobile10).stream()
                        .filter(a -> a.getRole() == UserRole.PARENT)
                        .findFirst()
                        .orElseGet(() -> {
                            String gid = "GRD-" + school + "-" + mobile10.substring(mobile10.length() - 4) + "-" + String.format("%03d", (int) (parentRepository.count() + 1));
                            while (userAccountRepository.existsById(gid) || userAccountRepository.existsByLoginIdIgnoreCase(gid)) {
                                gid = gid + "1";
                            }
                            return userAccountRepository.save(UserAccount.builder()
                                    .id(gid).loginId(gid).password(passwordEncoder.encode(membershipService.unusablePassword()))
                                    .name(student.getParentName() != null ? student.getParentName() : (student.getFatherName() != null ? student.getFatherName() : "Parent"))
                                    .mobile(mobile10).email(student.getParentEmail()).role(UserRole.PARENT)
                                    .status("Active").active(true).linkedStudentIds(new ArrayList<>()).build());
                        });
                membershipService.ensure(parentAcc, UserRole.PARENT, "Parent / Guardian");
                if (parentRepository.findByLoginIdIgnoreCase(parentAcc.getLoginId()).isEmpty()) {
                    parentRepository.save(Parent.builder().id(school + "-" + parentAcc.getLoginId()).loginId(parentAcc.getLoginId())
                            .name(parentAcc.getName()).mobile(mobile10).email(parentAcc.getEmail()).address(student.getAddress()).build());
                }
                student.setParentAccountId(parentAcc.getLoginId());
                if (student.getParentName() == null || student.getParentName().isBlank()) student.setParentName(parentAcc.getName());
            }
        }

        Student saved = studentRepository.save(student);

        // Auto-create student login account
        if (!userAccountRepository.existsByLoginIdIgnoreCase(saved.getId())) {
            String pwd = (initialPassword != null && !initialPassword.isBlank()) ? initialPassword : membershipService.unusablePassword();
            String email = (saved.getParentEmail() != null && !saved.getParentEmail().isBlank()) ? saved.getParentEmail() : saved.getId().toLowerCase() + "@student.futureschool.edu";
            UserAccount account = UserAccount.builder()
                    .id("USR-" + saved.getId())
                    .loginId(saved.getId())
                    .password(passwordEncoder.encode(pwd))
                    .name(saved.getName())
                    .email(email)
                    .role(UserRole.STUDENT)
                    .studentId(saved.getId())
                    .status("Active")
                    .active(true)
                    .build();
            userAccountRepository.save(account);
        }
        // Access to THIS school (also for an account that already exists in another school).
        userAccountRepository.findByLoginIdIgnoreCase(saved.getId())
                .ifPresent(acc -> membershipService.ensure(acc, UserRole.STUDENT, "Student"));

        // If parent exists in this school, automatically link this child to parent's account
        if (saved.getParentAccountId() != null && !saved.getParentAccountId().isBlank()) {
            userAccountRepository.findByLoginIdIgnoreCase(saved.getParentAccountId())
                    .filter(acc -> schoolMembershipRepository.existsByAccountIdAndSchoolIdAndRole(acc.getId(), school, UserRole.PARENT))
                    .ifPresent(acc -> {
                        if (!acc.getLinkedStudentIds().contains(saved.getId())) {
                            acc.getLinkedStudentIds().add(saved.getId());
                            userAccountRepository.save(acc);
                        }
                    });
        }

        // School fee for the CURRENT academic year, split over that year's configured schedule.
        // No schedule = no charges (never invented dates); the CSV import reports it per row.
        if ("Active".equalsIgnoreCase(saved.getStatus()) && saved.getFeeBalance() != null && saved.getFeeBalance() > 0) {
            String yearId = academicYears.ensureCurrent().getId();
            provisionYearFees(instalmentRepository, chargeRepository, saved, Math.round(saved.getFeeBalance()), yearId, yearId);
        }

        return saved;
    }

    /** The configured fee schedule of one academic year (year-less pre-V13 rows count as the current year). */
    public static List<FeeInstalment> scheduleFor(FeeInstalmentRepository instalments, String yearId, String currentYearId) {
        return instalments.findAllByOrderByNumberAsc().stream()
                .filter(i -> AcademicYearService.sameYear(i.getAcademicYearId(), yearId, currentYearId)).toList();
    }

    /**
     * Creates SCHOOL_FEE charges for one student for one academic year, split over that year's
     * schedule and due dates. Safe to retry: a student already charged for that year gets nothing new.
     * Returns how many charges were created (0 when already charged or the year has no schedule).
     */
    public static int provisionYearFees(FeeInstalmentRepository instalments, FeeChargeRepository charges, Student s, long annualFee,
                                        String yearId, String currentYearId) {
        if (annualFee <= 0) return 0;
        List<FeeInstalment> terms = scheduleFor(instalments, yearId, currentYearId);
        if (terms.isEmpty()) return 0;
        boolean alreadyCharged = charges.findByStudentIdOrderByDueOnAscIdAsc(s.getId()).stream()
                .anyMatch(c -> AcademicYearService.sameYear(c.getAcademicYearId(), yearId, currentYearId));
        if (alreadyCharged) return 0;
        long base = annualFee / terms.size();
        long rem = annualFee - (base * terms.size());
        for (int i = 0; i < terms.size(); i++) {
            FeeInstalment ins = terms.get(i);
            long amt = base + (i == 0 ? rem : 0);
            charges.save(FeeCharge.builder()
                    .id(s.getId() + "-" + yearId + "-SF-" + ins.getNumber())
                    .studentId(s.getId())
                    .academicYearId(yearId)
                    .category("SCHOOL_FEE")
                    .instalment(ins.getNumber())
                    .label("School fee")
                    .amount(amt)
                    .dueOn(ins.getDueOn())
                    .build());
        }
        return terms.size();
    }

    @Transactional
    public Student updateStudent(String id, Student updated) {
        Student existing = getStudentById(id)
                .orElseThrow(() -> new RuntimeException("Student not found with ID: " + id));
        String school = TenantContext.require();

        if (updated.getName() != null) existing.setName(updated.getName());
        if (updated.getAdmissionNumber() != null) existing.setAdmissionNumber(updated.getAdmissionNumber());
        if (updated.getDob() != null) existing.setDob(updated.getDob());
        if (updated.getGender() != null) existing.setGender(updated.getGender());
        if (updated.getClassId() != null) existing.setClassId(updated.getClassId());
        if (updated.getClassName() != null) existing.setClassName(updated.getClassName());
        if (updated.getSection() != null) existing.setSection(updated.getSection());
        if (updated.getRoll() != null) existing.setRoll(updated.getRoll());
        if (updated.getParentAccountId() != null) existing.setParentAccountId(updated.getParentAccountId());
        if (updated.getParentName() != null) existing.setParentName(updated.getParentName());
        if (updated.getParentMobile() != null) existing.setParentMobile(updated.getParentMobile());
        if (updated.getParentEmail() != null) existing.setParentEmail(updated.getParentEmail());
        if (updated.getAddress() != null) existing.setAddress(updated.getAddress());
        if (updated.getDistrict() != null) existing.setDistrict(updated.getDistrict());
        if (updated.getMandal() != null) existing.setMandal(updated.getMandal());
        if (updated.getPincode() != null) existing.setPincode(updated.getPincode());
        if (updated.getAadhaarNumber() != null) existing.setAadhaarNumber(updated.getAadhaarNumber());
        if (updated.getApaarId() != null) existing.setApaarId(updated.getApaarId());
        if (updated.getBloodGroup() != null) existing.setBloodGroup(updated.getBloodGroup());
        if (updated.getCasteCategory() != null) existing.setCasteCategory(updated.getCasteCategory());
        if (updated.getSubCaste() != null) existing.setSubCaste(updated.getSubCaste());
        if (updated.getReligion() != null) existing.setReligion(updated.getReligion());
        if (updated.getMotherTongue() != null) existing.setMotherTongue(updated.getMotherTongue());
        if (updated.getFatherName() != null) existing.setFatherName(updated.getFatherName());
        if (updated.getFatherMobile() != null) existing.setFatherMobile(updated.getFatherMobile());
        if (updated.getFatherOccupation() != null) existing.setFatherOccupation(updated.getFatherOccupation());
        if (updated.getFatherAadhaar() != null) existing.setFatherAadhaar(updated.getFatherAadhaar());
        if (updated.getMotherName() != null) existing.setMotherName(updated.getMotherName());
        if (updated.getMotherMobile() != null) existing.setMotherMobile(updated.getMotherMobile());
        if (updated.getMotherOccupation() != null) existing.setMotherOccupation(updated.getMotherOccupation());
        if (updated.getMotherAadhaar() != null) existing.setMotherAadhaar(updated.getMotherAadhaar());
        if (updated.getMediumOfInstruction() != null) existing.setMediumOfInstruction(updated.getMediumOfInstruction());
        if (updated.getSecondLanguage() != null) existing.setSecondLanguage(updated.getSecondLanguage());
        if (updated.getPreviousSchool() != null) existing.setPreviousSchool(updated.getPreviousSchool());
        if (updated.getTcNumber() != null) existing.setTcNumber(updated.getTcNumber());
        if (updated.getTransportRouteId() != null) existing.setTransportRouteId(updated.getTransportRouteId());
        if (updated.getStatus() != null) existing.setStatus(updated.getStatus());
        if (updated.getFeeBalance() != null) existing.setFeeBalance(updated.getFeeBalance());

        // Update corresponding user account name only when member of this school
        if (updated.getName() != null) {
            userAccountRepository.findByLoginIdIgnoreCase(existing.getId())
                    .filter(acc -> schoolMembershipRepository.existsByAccountIdAndSchoolIdAndRole(acc.getId(), school, UserRole.STUDENT))
                    .ifPresent(acc -> {
                        acc.setName(updated.getName());
                        userAccountRepository.save(acc);
                    });
        }

        return studentRepository.save(existing);
    }

    @Transactional
    public void deleteStudent(String id) {
        Student existing = getStudentById(id)
                .orElseThrow(() -> new RuntimeException("Student not found with ID: " + id));
        String school = TenantContext.require();
        userAccountRepository.findByLoginIdIgnoreCase(existing.getId())
                .ifPresent(acc -> schoolMembershipRepository.findBySchoolId(school).stream()
                        .filter(m -> m.getAccountId().equals(acc.getId()) && m.getRole() == UserRole.STUDENT)
                        .forEach(m -> {
                            m.setActive(false);
                            schoolMembershipRepository.save(m);
                        }));
        existing.setStatus("Exited");
        studentRepository.save(existing);
    }

    @Transactional
    public Student recordExit(String id, String effectiveDate, String reason, String destinationSchool) {
        Student existing = getStudentById(id)
                .orElseThrow(() -> new RuntimeException("Student not found with ID: " + id));
        String school = TenantContext.require();

        existing.setStatus("Transferred");
        existing.setExitDate(effectiveDate);
        existing.setExitReason(reason);
        existing.setDestinationSchool(destinationSchool);

        // Deactivate school membership (never hard-delete or touch other schools)
        userAccountRepository.findByLoginIdIgnoreCase(existing.getId())
                .ifPresent(acc -> {
                    schoolMembershipRepository.findBySchoolId(school).stream()
                            .filter(m -> m.getAccountId().equals(acc.getId()) && m.getRole() == UserRole.STUDENT)
                            .forEach(m -> {
                                m.setActive(false);
                                schoolMembershipRepository.save(m);
                            });
                    if (schoolMembershipRepository.findByAccountIdAndActiveTrue(acc.getId()).isEmpty()) {
                        acc.setActive(false);
                        acc.setStatus("Inactive");
                        userAccountRepository.save(acc);
                    }
                });

        return studentRepository.save(existing);
    }

    @Transactional
    public Student updateHallTicket(String id, Boolean released, Boolean approved) {
        Student existing = getStudentById(id)
                .orElseThrow(() -> new RuntimeException("Student not found with ID: " + id));

        if (released != null) existing.setHallTicketReleased(released);
        if (approved != null) existing.setHallTicketApproved(approved);

        return studentRepository.save(existing);
    }
}
