package com.futureschool.backend.init;

import com.futureschool.backend.entity.*;
import com.futureschool.backend.repository.*;
import com.futureschool.backend.tenant.TenantContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.List;

/**
 * Development seed. Uses the SAME people, ids, mobiles and emails as the frontend prototype
 * (Frontend/docs/PROTOTYPE_LOGINS.md), so a real backend sign-in lines up with the
 * frontend's demo data. Idempotent. Disable in production: app.seed.demo-data=false.
 *
 * Parents and teachers sign in with mobile OTP (no password). Principal/Admin use the
 * school email + password, then an email OTP.
 */
@Component
public class DataInitializer implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(DataInitializer.class);
    public static final String GVS = "GVS";
    public static final String SJM = "SJM";

    private final SchoolRepository schools;
    private final SchoolMembershipRepository memberships;
    private final SchoolClassRepository classRepository;
    private final UserAccountRepository accounts;
    private final StudentRepository studentRepository;
    private final TeacherRepository teacherRepository;
    private final ParentRepository parentRepository;
    private final PasswordEncoder passwordEncoder;
    private final TransactionTemplate tx;
    private final ParentDataSeed parentData;
    private final TeachingSeed teachingSeed;
    private final GovernanceSeed governanceSeed;
    private final LeaveSeed leaveSeed;
    private final CommsSeed commsSeed;
    private final OfficeSeed officeSeed;

    @Value("${app.seed.demo-data:true}")
    private boolean seedDemo;

    public DataInitializer(SchoolRepository schools, SchoolMembershipRepository memberships, SchoolClassRepository classRepository,
                           UserAccountRepository accounts, StudentRepository studentRepository, TeacherRepository teacherRepository,
                           ParentRepository parentRepository, PasswordEncoder passwordEncoder, TransactionTemplate tx,
                           ParentDataSeed parentData, TeachingSeed teachingSeed, GovernanceSeed governanceSeed,
                           LeaveSeed leaveSeed, CommsSeed commsSeed, OfficeSeed officeSeed) {
        this.officeSeed = officeSeed;
        this.leaveSeed = leaveSeed;
        this.commsSeed = commsSeed;
        this.governanceSeed = governanceSeed;
        this.parentData = parentData;
        this.teachingSeed = teachingSeed;
        this.schools = schools;
        this.memberships = memberships;
        this.classRepository = classRepository;
        this.accounts = accounts;
        this.studentRepository = studentRepository;
        this.teacherRepository = teacherRepository;
        this.parentRepository = parentRepository;
        this.passwordEncoder = passwordEncoder;
        this.tx = tx;
    }

    @Override
    public void run(String... args) {
        if (!seedDemo) {
            log.info("Demo seed disabled (app.seed.demo-data=false)");
            return;
        }
        tx.executeWithoutResult(s -> {
            school(GVS, "Greenwood Valley High School");
            school(SJM, "St. Jude Model High School");
            // Demo: St. Jude is the CBSE school, Greenwood the Telangana SSC school.
            schools.findById(SJM).filter(x -> !"CBSE".equals(x.getBoard())).ifPresent(x -> {
                x.setBoard("CBSE");
                schools.save(x);
            });
        });
        // OTP-only people get a random password nobody knows (never used).
        String noPassword = passwordEncoder.encode(java.util.UUID.randomUUID().toString());

        UserAccount rajesh = person("GRD-0001", "Rajesh Sharma", null, "9876543210", UserRole.PARENT, noPassword,
                List.of("GVS-2027-0001", "GVS-2031-0042", "SJM-2033-0105"));
        UserAccount meena = person("GRD-0002", "Meena Sharma", null, "9876543211", UserRole.PARENT, noPassword,
                List.of("GVS-2027-0001", "GVS-2031-0042", "SJM-2033-0105"));
        UserAccount srinivas = person("GRD-0003", "Srinivas Reddy", null, "9848011111", UserRole.PARENT, noPassword, List.of("GVS-2028-0117"));
        UserAccount sarah = person("STF-T-0001", "Sarah Jenkins", null, "9848012345", UserRole.TEACHER, noPassword, List.of());
        UserAccount nair = person("STF-T-0002", "Raghavan Nair", null, "9848022222", UserRole.TEACHER, noPassword, List.of());
        UserAccount mary = person("STF-T-0101", "J. Mary", null, "9848033333", UserRole.TEACHER, noPassword, List.of());
        UserAccount gvsPrincipal =person("ACC-L-0001", "Dr. Shashi Shekhar", "principal@greenwoodvalley.edu.in", null, UserRole.PRINCIPAL,
                passwordEncoder.encode("Greenwood@2026"), List.of());
        UserAccount sundaram = person("ACC-L-0002", "S. Sundaram", "admin@greenwoodvalley.edu.in", null, UserRole.ADMIN,
                passwordEncoder.encode("Greenwood@2026"), List.of());
        UserAccount priya = person("ACC-L-0003", "Priya Narayanan", "office@greenwoodvalley.edu.in", null, UserRole.ADMIN,
                passwordEncoder.encode("Greenwood@2026"), List.of());
        UserAccount sjmPrincipal = person("ACC-L-0004", "Fr. Thomas Mathew", "principal@stjudemodel.edu.in", null, UserRole.PRINCIPAL,
                passwordEncoder.encode("StJude@2026"), List.of());

        member("MEM-P-0001", rajesh, GVS, UserRole.PARENT, "Parent / Guardian", null);
        member("MEM-P-0002", rajesh, SJM, UserRole.PARENT, "Parent / Guardian", null);
        member("MEM-P-0003", meena, GVS, UserRole.PARENT, "Parent / Guardian", null);
        member("MEM-P-0004", meena, SJM, UserRole.PARENT, "Parent / Guardian", null);
        member("MEM-P-0005", srinivas, GVS, UserRole.PARENT, "Parent / Guardian", null);
        member("MEM-T-0001", sarah, GVS, UserRole.TEACHER, "Class Teacher 10-A · Physical Science", null);
        // A teacher teaches in one school: SJM has its own class teacher (MEM-T-0002 is no longer used).
        member("MEM-T-0101", mary, SJM, UserRole.TEACHER, "Class Teacher 4-B · English, Mathematics", null);
        member("MEM-T-0003", nair, GVS, UserRole.TEACHER, "Class Teacher 10-B · Mathematics", null);
        // Demo sign-in PIN 2580 for Raghavan Nair (same as the frontend prototype). Set once: an Admin reset stays reset.
        memberships.findById("MEM-T-0003").filter(m -> m.getPinHash() == null && m.getPinUpdatedAt() == null).ifPresent(m -> {
            m.setPinHash(passwordEncoder.encode("2580"));
            m.setPinUpdatedAt(java.time.Instant.now());
            memberships.save(m);
        });
        member("MEM-L-0001", gvsPrincipal, GVS, UserRole.PRINCIPAL, "Principal", null);
        member("MEM-L-0002", sundaram, GVS, UserRole.ADMIN, "Super Administrator · Full Access", "FINANCE,ADMISSIONS,ACADEMIC_OPS,TRANSPORT,COMPLAINTS,SECURITY,REPORTS");
        member("MEM-L-0003", priya, GVS, UserRole.ADMIN, "Administrator · Operations", "ACADEMIC_OPS,TRANSPORT,COMPLAINTS,REPORTS");
        member("MEM-L-0004", sjmPrincipal, SJM, UserRole.PRINCIPAL, "Principal", null);

        TenantContext.runAs(GVS, () -> tx.executeWithoutResult(s -> {
            classes(new String[][]{{"GVS-10-A", "Class 10", "A", "10"}, {"GVS-10-B", "Class 10", "B", "10"},
                    {"GVS-9-A", "Class 9", "A", "9"}, {"GVS-6-B", "Class 6", "B", "6"}});
            teacherRecord("STF-T-0001", "Sarah Jenkins", "Class Teacher 10-A", "Physical Science");
            teacherRecord("STF-T-0002", "Raghavan Nair", "Class Teacher 10-B", "Mathematics");
            parentRecord("GRD-0001", "Rajesh Sharma", "9876543210");
            parentRecord("GRD-0002", "Meena Sharma", "9876543211");
            parentRecord("GRD-0003", "Srinivas Reddy", "9848011111");
            student("GVS-2027-0001", "Aarav Sharma", "GVS-10-A", "Class 10", "A", "18", "GRD-0001");
            student("GVS-2031-0042", "Ananya Sharma", "GVS-6-B", "Class 6", "B", "07", "GRD-0001");
            student("GVS-2028-0117", "Kavya Reddy", "GVS-9-A", "Class 9", "A", "03", "GRD-0003");
            teachingSeed.seedGvs();
            parentData.seedGvs();
            governanceSeed.seedGvs();
            leaveSeed.seedGvs();
            commsSeed.seedGvs();
            officeSeed.seedGvs();
        }));
        TenantContext.runAs(SJM, () -> tx.executeWithoutResult(s -> {
            classes(new String[][]{{"SJM-4-B", "Class 4", "B", "4"}});
            teacherRecord("STF-T-0101", "J. Mary", "Class Teacher 4-B", "English");
            parentRecord("GRD-0001", "Rajesh Sharma", "9876543210");
            student("SJM-2033-0105", "Rohan Sharma", "SJM-4-B", "Class 4", "B", "12", "GRD-0001");
            parentData.seedSjm();
            leaveSeed.seedSjm();
            commsSeed.seedSjm();
        }));
        log.info("Demo seed ready: schools GVS and SJM (same people as the frontend prototype)");
    }

    private void school(String id, String name) {
        if (!schools.existsById(id)) schools.save(School.builder().id(id).name(name).build());
    }

    private UserAccount person(String id, String name, String email, String mobile, UserRole role, String pwdHash, List<String> children) {
        UserAccount a = accounts.findById(id).orElseGet(() -> UserAccount.builder()
                .id(id).loginId(id).password(pwdHash).name(name).email(email).mobile(mobile).role(role)
                .status("Active").active(true).linkedStudentIds(new ArrayList<>()).build());
        if (role == UserRole.TEACHER) a.setTeacherId(id);
        for (String c : children) if (!a.getLinkedStudentIds().contains(c)) a.getLinkedStudentIds().add(c);
        return accounts.save(a);
    }

    private void member(String id, UserAccount a, String school, UserRole role, String title, String permissions) {
        SchoolMembership m = memberships.findById(id).orElse(null);
        if (m == null) {
            memberships.save(SchoolMembership.builder().id(id).accountId(a.getId()).schoolId(school).role(role)
                    .title(title).permissions(permissions).active(true).build());
        } else {
            m.setPermissions(permissions);
            m.setTitle(title);
            memberships.save(m);
        }
    }

    private void classes(String[][] rows) {
        for (String[] cd : rows) {
            if (classRepository.existsById(cd[0])) continue; // school-filtered
            if (classRepository.findByNameAndSection(cd[1], cd[2]).isPresent()) continue;
            classRepository.save(SchoolClass.builder().id(cd[0]).name(cd[1]).section(cd[2])
                    .gradeNumber(Integer.parseInt(cd[3])).schoolLevel(Integer.parseInt(cd[3]) >= 9 ? "Senior" : "Middle").active(true).build());
        }
    }

    private void teacherRecord(String staffId, String name, String designation, String subject) {
        if (teacherRepository.findByTeacherIdIgnoreCase(staffId).isPresent()) return;
        // Primary keys are global, so the row id carries the school; teacher_id is unique per school.
        teacherRepository.save(Teacher.builder().id(TenantContext.require() + "-" + staffId).teacherId(staffId).name(name)
                .designation(designation).primarySubject(subject).active(true).build());
    }

    private void parentRecord(String guardianId, String name, String mobile) {
        if (parentRepository.findByLoginIdIgnoreCase(guardianId).isPresent()) return;
        parentRepository.save(Parent.builder().id(TenantContext.require() + "-" + guardianId).loginId(guardianId).name(name).mobile(mobile).build());
    }

    private void student(String id, String name, String classId, String className, String section, String roll, String guardianId) {
        if (studentRepository.existsById(id) || studentRepository.findByAdmissionNumber(id).isPresent()) return;
        studentRepository.save(Student.builder().id(id).admissionNumber(id).name(name).classId(classId).className(className)
                .section(section).roll(roll).parentAccountId(guardianId).status("Active").build());
    }
}
