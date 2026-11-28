package com.futureschool.backend.init;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.futureschool.backend.entity.*;
import com.futureschool.backend.parent.ParentDataService;
import com.futureschool.backend.repository.*;
import com.futureschool.backend.security.AuthSessionCache;
import com.futureschool.backend.tenant.TenantContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.*;

/**
 * Production-shaped real dataset for "Future School" (school id FS):
 * - 1 Principal + 2 Admins (satisfies governance quorum >= 2)
 * - 7 Teachers covering the 7 SSC subjects (Telugu, Hindi, English, Mathematics, Physical Science, Biological Science, Social Studies)
 *   with 6 teachers serving as Class Teachers (8-A, 8-B, 9-A, 9-B, 10-A, 10-B) and 1 Subject Teacher
 * - 180 Students across 6 sections (30 per class: FS-8-A .. FS-10-B) with 180 Parent/Guardian accounts
 * - 100% clash-free weekly timetable (6 days x 7 periods across all 6 classes)
 * - Fees, Term 1 receipts, recent attendance, academic year, exam window, calm notices, homework, and bus routes
 *
 * Also archives legacy demo schools (GVS, SJM) when enabled cleanly without demo data.
 */
@Component
public class FutureSchoolSeed {

    private static final Logger log = LoggerFactory.getLogger(FutureSchoolSeed.class);
    public static final String FS = "FS";
    public static final String AY_ID = "AY-FS-2026-27";

    public record TeacherSpec(String id, String name, String subject, String mobile, String email,
                              String classId, String classLabel, String qualification) {}

    public static final List<String> SUBJECTS = List.of(
            "Telugu", "Hindi", "English", "Mathematics", "Physical Science", "Biological Science", "Social Studies"
    );

    public static final List<TeacherSpec> TEACHERS = List.of(
            new TeacherSpec("STF-FS-01", "Dr. Kavitha Rao", "Telugu", "9000000001", "kavitha.rao@futureschool.edu.in", "FS-8-A", "Class 8-A", "M.A., Ph.D. Telugu"),
            new TeacherSpec("STF-FS-02", "Rajeshwari Sharma", "Hindi", "9000000002", "rajeshwari.sharma@futureschool.edu.in", "FS-8-B", "Class 8-B", "M.A., B.Ed. Hindi"),
            new TeacherSpec("STF-FS-03", "David Thomas", "English", "9000000003", "david.thomas@futureschool.edu.in", "FS-9-A", "Class 9-A", "M.A., B.Ed. English"),
            new TeacherSpec("STF-FS-04", "Srinivasulu Naidu", "Mathematics", "9000000004", "srinivasulu.naidu@futureschool.edu.in", "FS-9-B", "Class 9-B", "M.Sc., B.Ed. Mathematics"),
            new TeacherSpec("STF-FS-05", "Ananya Deshmukh", "Physical Science", "9000000005", "ananya.deshmukh@futureschool.edu.in", "FS-10-A", "Class 10-A", "M.Sc., B.Ed. Physics"),
            new TeacherSpec("STF-FS-06", "Dr. Venkatraman Iyer", "Biological Science", "9000000006", "venkatraman.iyer@futureschool.edu.in", "FS-10-B", "Class 10-B", "M.Sc., Ph.D. Life Sciences"),
            new TeacherSpec("STF-FS-07", "Prakash Kulkarni", "Social Studies", "9000000007", "prakash.kulkarni@futureschool.edu.in", null, null, "M.A., B.Ed. History")
    );

    public record ClassSpec(String id, String name, String section, int grade, long annualTuition, TeacherSpec classTeacher) {}

    public static final List<ClassSpec> CLASSES = List.of(
            new ClassSpec("FS-8-A", "Class 8", "A", 8, 36000L, TEACHERS.get(0)),
            new ClassSpec("FS-8-B", "Class 8", "B", 8, 36000L, TEACHERS.get(1)),
            new ClassSpec("FS-9-A", "Class 9", "A", 9, 40000L, TEACHERS.get(2)),
            new ClassSpec("FS-9-B", "Class 9", "B", 9, 40000L, TEACHERS.get(3)),
            new ClassSpec("FS-10-A", "Class 10", "A", 10, 44000L, TEACHERS.get(4)),
            new ClassSpec("FS-10-B", "Class 10", "B", 10, 44000L, TEACHERS.get(5))
    );

    private static final String[][] PERIOD_TIMES = {
            {"09:00", "09:45"}, {"09:45", "10:30"}, {"10:45", "11:30"},
            {"11:30", "12:15"}, {"13:00", "13:45"}, {"13:45", "14:30"}, {"14:30", "15:15"}
    };

    private static final DayOfWeek[] DAYS = {
            DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY,
            DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY
    };

    private static final String[] FIRST_NAMES = {
            "Aarav", "Aadhya", "Vivaan", "Diya", "Aditya", "Saanvi", "Vihaan", "Ananya", "Arjun", "Anvi",
            "Reyansh", "Myra", "Sai", "Aaradhya", "Krishna", "Pari", "Ishaan", "Navya", "Shaurya", "Kiara",
            "Rohan", "Nithya", "Karthik", "Harini", "Pranav", "Meghana", "Siddharth", "Lasya", "Nikhil", "Vaishnavi"
    };

    private static final String[] LAST_NAMES = {
            "Reddy", "Sharma", "Rao", "Naidu", "Varma", "Patel"
    };

    private static final String[] GUARDIAN_PREFIX = {
            "Suresh", "Lakshmi", "Ramesh", "Padma", "Venkatesh", "Sunitha"
    };

    private final SchoolRepository schools;
    private final SchoolSettingRepository settings;
    private final AcademicYearRepository academicYears;
    private final SchoolMembershipRepository memberships;
    private final SchoolClassRepository classes;
    private final UserAccountRepository accounts;
    private final TeacherRepository teachers;
    private final ParentRepository parents;
    private final StudentRepository students;
    private final StudentEnrollmentRepository enrollments;
    private final ClassSubjectTeacherRepository subjectTeachers;
    private final TimetableSlotRepository timetable;
    private final FeeInstalmentRepository instalments;
    private final FeeChargeRepository charges;
    private final FeePaymentRepository payments;
    private final ExamWindowRepository exams;
    private final AssessmentRepository assessments;
    private final ClassNoticeRepository notices;
    private final HomeworkTaskRepository homework;
    private final BusRouteRepository routes;
    private final StudentAttendanceDayRepository attendance;
    private final PasswordEncoder passwordEncoder;
    private final TransactionTemplate tx;
    private final ObjectMapper json;
    private AuthSessionCache sessionCache;

    public FutureSchoolSeed(SchoolRepository schools, SchoolSettingRepository settings, AcademicYearRepository academicYears,
                            SchoolMembershipRepository memberships, SchoolClassRepository classes, UserAccountRepository accounts,
                            TeacherRepository teachers, ParentRepository parents, StudentRepository students,
                            StudentEnrollmentRepository enrollments, ClassSubjectTeacherRepository subjectTeachers,
                            TimetableSlotRepository timetable, FeeInstalmentRepository instalments, FeeChargeRepository charges,
                            FeePaymentRepository payments, ExamWindowRepository exams, AssessmentRepository assessments,
                            ClassNoticeRepository notices, HomeworkTaskRepository homework, BusRouteRepository routes,
                            StudentAttendanceDayRepository attendance, PasswordEncoder passwordEncoder,
                            TransactionTemplate tx, ObjectMapper json) {
        this.schools = schools;
        this.settings = settings;
        this.academicYears = academicYears;
        this.memberships = memberships;
        this.classes = classes;
        this.accounts = accounts;
        this.teachers = teachers;
        this.parents = parents;
        this.students = students;
        this.enrollments = enrollments;
        this.subjectTeachers = subjectTeachers;
        this.timetable = timetable;
        this.instalments = instalments;
        this.charges = charges;
        this.payments = payments;
        this.exams = exams;
        this.assessments = assessments;
        this.notices = notices;
        this.homework = homework;
        this.routes = routes;
        this.attendance = attendance;
        this.passwordEncoder = passwordEncoder;
        this.tx = tx;
        this.json = json;
    }

    @Autowired(required = false)
    public void setSessionCache(AuthSessionCache sessionCache) {
        this.sessionCache = sessionCache;
    }

    public void seed() {
        long t0 = System.currentTimeMillis();
        archiveDemoSchools();

        var existingCount = new java.util.concurrent.atomic.AtomicLong(0L);
        TenantContext.runAs(FS, () -> tx.executeWithoutResult(st -> existingCount.set(students.count())));
        long existingFsStudents = existingCount.get();
        if (schools.existsById(FS) && accounts.existsById("ACC-FS-PRIN") && existingFsStudents >= 180) {
            log.info("Future School (FS) already seeded ({} students); skipping re-seed.", existingFsStudents);
            return;
        }

        // Hash passwords once per role group (BCrypt is CPU-intensive; avoid 180x extra rounds for OTP-only accounts)
        String staffPasswordHash = passwordEncoder.encode("FutureSchool@2026");
        String otpOnlyPlaceholder = passwordEncoder.encode(UUID.randomUUID().toString());

        tx.executeWithoutResult(s -> {
            schools.save(School.builder()
                    .id(FS)
                    .name("Future School")
                    .board("TELANGANA_SSC")
                    .status("ACTIVE")
                    .lateFeePolicy("Late fee as per Future School policy, set by the school Admin.")
                    .build());

            List<UserAccount> accBatch = new ArrayList<>();
            List<SchoolMembership> memBatch = new ArrayList<>();

            // 1 Principal + 2 Admins
            accBatch.add(account("ACC-FS-PRIN", "Dr. Sudha Madhavan", "principal@futureschool.edu.in", null,
                    UserRole.PRINCIPAL, staffPasswordHash, List.of()));
            memBatch.add(SchoolMembership.builder().id("MEM-FS-PRIN").accountId("ACC-FS-PRIN").schoolId(FS)
                    .role(UserRole.PRINCIPAL).title("Principal").permissions("").active(true).build());

            accBatch.add(account("ACC-FS-ADM1", "Ramesh Babu G.", "admin1@futureschool.edu.in", null,
                    UserRole.ADMIN, staffPasswordHash, List.of()));
            memBatch.add(SchoolMembership.builder().id("MEM-FS-ADM1").accountId("ACC-FS-ADM1").schoolId(FS)
                    .role(UserRole.ADMIN).title("Administrator · Finance & Admissions")
                    .permissions("FINANCE,ADMISSIONS,SECURITY,REPORTS").active(true).build());

            accBatch.add(account("ACC-FS-ADM2", "Lakshmi Narayana K.", "admin2@futureschool.edu.in", null,
                    UserRole.ADMIN, staffPasswordHash, List.of()));
            memBatch.add(SchoolMembership.builder().id("MEM-FS-ADM2").accountId("ACC-FS-ADM2").schoolId(FS)
                    .role(UserRole.ADMIN).title("Administrator · Academics & Operations")
                    .permissions("ACADEMIC_OPS,TRANSPORT,COMPLAINTS,SECURITY,REPORTS").active(true).build());

            // 7 Teachers (mobile OTP login; leave PIN unset so first login tests/uses onboarding cleanly)
            for (TeacherSpec ts : TEACHERS) {
                UserAccount ua = account(ts.id(), ts.name(), ts.email(), ts.mobile(), UserRole.TEACHER, otpOnlyPlaceholder, List.of());
                ua.setTeacherId(ts.id());
                accBatch.add(ua);
                String title = ts.classLabel() != null
                        ? "Class Teacher " + ts.classLabel().replace("Class ", "") + " · " + ts.subject()
                        : "Subject Teacher · " + ts.subject();
                memBatch.add(SchoolMembership.builder().id("MEM-" + ts.id()).accountId(ts.id()).schoolId(FS)
                        .role(UserRole.TEACHER).title(title).active(true).build());
            }

            // 180 Student Records -> build account + membership batches + tenant entities together
            accounts.saveAll(accBatch);
            memberships.saveAll(memBatch);
        });

        TenantContext.runAs(FS, () -> tx.executeWithoutResult(s -> seedTenantData(otpOnlyPlaceholder)));
        if (sessionCache != null) sessionCache.clear();
        log.info("Future School (FS) seeded in {} ms: 6 classes, 7 teachers, 180 students, 1 Principal, 2 Admins.",
                System.currentTimeMillis() - t0);
    }

    private void seedTenantData(String otpOnlyPlaceholder) {
        if (!settings.existsById("SET-FS")) {
            settings.save(SchoolSetting.builder()
                    .id("SET-FS")
                    .schoolName("Future School")
                    .schoolCode("FS-2026")
                    .affiliationNumber("TS-SSC-FS01")
                    .address("Road No. 12, Banjara Hills, Hyderabad, Telangana 500034")
                    .phone("+91 40 2354 8800")
                    .email("office@futureschool.edu.in")
                    .website("https://futureschool.edu.in")
                    .currentAcademicYear("2026-2027")
                    .build());
        }

        if (academicYears.findByIsCurrentTrue().isEmpty()) {
            academicYears.save(AcademicYear.builder()
                    .id(AY_ID)
                    .name("2026-27")
                    .startDate(LocalDate.of(2026, 6, 12))
                    .endDate(LocalDate.of(2027, 4, 23))
                    .isCurrent(true)
                    .build());
        }

        // Classes (8A, 8B, 9A, 9B, 10A, 10B)
        List<SchoolClass> classEntities = new ArrayList<>();
        for (ClassSpec cs : CLASSES) {
            if (!classes.existsById(cs.id())) {
                classEntities.add(SchoolClass.builder()
                        .id(cs.id())
                        .name(cs.name())
                        .section(cs.section())
                        .gradeNumber(cs.grade())
                        .schoolLevel(cs.grade() >= 9 ? "Senior" : "Middle")
                        .classTeacherId(cs.classTeacher().id())
                        .classTeacherName(cs.classTeacher().name())
                        .active(true)
                        .build());
            }
        }
        if (!classEntities.isEmpty()) classes.saveAll(classEntities);

        // 7 Teachers
        List<Teacher> teacherEntities = new ArrayList<>();
        for (TeacherSpec ts : TEACHERS) {
            String pk = FS + "-" + ts.id();
            if (!teachers.existsById(pk)) {
                String designation = ts.classLabel() != null ? "Class Teacher " + ts.classLabel().replace("Class ", "") : "Subject Teacher";
                teacherEntities.add(Teacher.builder()
                        .id(pk)
                        .teacherId(ts.id())
                        .name(ts.name())
                        .email(ts.email())
                        .phone(ts.mobile())
                        .designation(designation)
                        .qualification(ts.qualification())
                        .primarySubject(ts.subject())
                        .active(true)
                        .build());
            }
        }
        if (!teacherEntities.isEmpty()) teachers.saveAll(teacherEntities);

        // Subject allocations across all 6 classes (all 7 subjects per class)
        if (subjectTeachers.count() == 0) {
            List<ClassSubjectTeacher> cstBatch = new ArrayList<>();
            for (ClassSpec cs : CLASSES) {
                for (int i = 0; i < TEACHERS.size(); i++) {
                    TeacherSpec ts = TEACHERS.get(i);
                    String id = cs.id() + "-" + (i + 1) + "-" + ts.subject().replace(' ', '_');
                    cstBatch.add(ClassSubjectTeacher.builder()
                            .id(id).classId(cs.id()).subject(ts.subject())
                            .staffId(ts.id()).staffName(ts.name()).build());
                }
            }
            subjectTeachers.saveAll(cstBatch);
        }

        // Clash-free weekly timetable: 6 classes x 6 days x 7 periods -> 252 slots
        if (timetable.count() == 0) {
            List<TimetableSlot> ttBatch = new ArrayList<>();
            for (int cIdx = 0; cIdx < CLASSES.size(); cIdx++) {
                ClassSpec cs = CLASSES.get(cIdx);
                for (int dIdx = 0; dIdx < DAYS.length; dIdx++) {
                    for (int pIdx = 0; pIdx < PERIOD_TIMES.length; pIdx++) {
                        TeacherSpec ts = TEACHERS.get((cIdx + dIdx + pIdx) % TEACHERS.size());
                        ttBatch.add(TimetableSlot.builder()
                                .id(cs.id() + "-" + DAYS[dIdx] + "-" + (pIdx + 1))
                                .classId(cs.id())
                                .dayOfWeek(DAYS[dIdx].name())
                                .periodNumber(pIdx + 1)
                                .startTime(PERIOD_TIMES[pIdx][0])
                                .endTime(PERIOD_TIMES[pIdx][1])
                                .subject(ts.subject())
                                .teacherId(ts.id())
                                .teacherName(ts.name())
                                .roomNumber("R-" + cs.grade() + cs.section())
                                .build());
                    }
                }
            }
            timetable.saveAll(ttBatch);
        }

        // 4 Fee Instalments linked to current AY
        List<FeeInstalment> feeTerms = List.of(
                FeeInstalment.builder().id("FS-INS-1").number(1).label("Term 1 · June").dueOn("2026-06-15").academicYearId(AY_ID).build(),
                FeeInstalment.builder().id("FS-INS-2").number(2).label("Term 2 · September").dueOn("2026-09-15").academicYearId(AY_ID).build(),
                FeeInstalment.builder().id("FS-INS-3").number(3).label("Term 3 · December").dueOn("2026-12-15").academicYearId(AY_ID).build(),
                FeeInstalment.builder().id("FS-INS-4").number(4).label("Term 4 · February").dueOn("2027-02-15").academicYearId(AY_ID).build()
        );
        if (instalments.count() == 0) {
            instalments.saveAll(feeTerms);
        }

        // Bus routes (use FS-prefixed global primary keys so they never collide with other tenants)
        if (routes.count() == 0) {
            routes.saveAll(List.of(
                    busRoute("FS-ROUTE-1", "Route 1 · Jubilee Hills", "TS 09 UA 1108", 40, new String[][]{{"Jubilee Checkpost", "07:05", "16:10"}, {"Film Nagar", "07:15", "16:00"}}),
                    busRoute("FS-ROUTE-2", "Route 2 · Madhapur", "TS 09 UA 2204", 40, new String[][]{{"Madhapur Metro", "07:10", "16:05"}, {"Ayyappa Society", "07:20", "15:55"}}),
                    busRoute("FS-ROUTE-3", "Route 3 · Banjara Hills", "TS 09 UA 3309", 36, new String[][]{{"KBR Park", "07:20", "15:55"}, {"GVK One", "07:28", "15:48"}})
            ));
        }

        // 180 Students (30 per class) + Parents + Accounts + Memberships + Enrollments + Fees + Attendance
        if (students.count() < 180) {
            List<Parent> parentBatch = new ArrayList<>(180);
            List<UserAccount> guardianAccounts = new ArrayList<>(180);
            List<SchoolMembership> guardianMemberships = new ArrayList<>(180);
            List<Student> studentBatch = new ArrayList<>(180);
            List<StudentEnrollment> enrollmentBatch = new ArrayList<>(180);
            List<FeeCharge> chargeBatch = new ArrayList<>(800);
            List<FeePayment> paymentBatch = new ArrayList<>(180);
            List<StudentAttendanceDay> attendanceBatch = new ArrayList<>(1200);

            String nowIso = java.time.OffsetDateTime.now(ParentDataService.SCHOOL_ZONE).toString();
            LocalDate today = LocalDate.now(ParentDataService.SCHOOL_ZONE);
            List<LocalDate> attDays = new ArrayList<>();
            for (int i = 7; i >= 0; i--) {
                LocalDate d = today.minusDays(i);
                if (d.getDayOfWeek() != DayOfWeek.SUNDAY) attDays.add(d);
            }

            int seq = 0;
            for (int cIdx = 0; cIdx < CLASSES.size(); cIdx++) {
                ClassSpec cs = CLASSES.get(cIdx);
                long perTerm = cs.annualTuition() / 4L;
                for (int r = 1; r <= 30; r++) {
                    seq++;
                    String seqStr = String.format("%03d", seq);
                    String rollStr = String.format("%02d", r);
                    String studentId = "FS-" + cs.grade() + cs.section() + "-" + rollStr;
                    String admNo = "FS-2026-" + seqStr;
                    String guardianId = "GRD-FS-" + seqStr;
                    String firstName = FIRST_NAMES[(r - 1 + cIdx * 5) % FIRST_NAMES.length];
                    String lastName = LAST_NAMES[(cIdx + (r / 5)) % LAST_NAMES.length];
                    String studentName = firstName + " " + lastName;
                    String guardianName = GUARDIAN_PREFIX[(seq - 1) % GUARDIAN_PREFIX.length] + " " + lastName;
                    String mobile = "9800000" + seqStr;
                    String dob = (2015 - cs.grade() + 1) + "-" + String.format("%02d", (r % 12) + 1) + "-" + String.format("%02d", ((r * 3) % 27) + 1);
                    String gender = (r % 2 == 0) ? "Female" : "Male";
                    String routeId = (r <= 12) ? "FS-ROUTE-" + ((r % 3) + 1) : null;
                    String stopName = routeId == null ? null : switch ((r % 3) + 1) {
                        case 1 -> "Jubilee Checkpost";
                        case 2 -> "Madhapur Metro";
                        default -> "KBR Park";
                    };

                    parentBatch.add(Parent.builder()
                            .id(FS + "-" + guardianId)
                            .loginId(guardianId)
                            .name(guardianName)
                            .mobile(mobile)
                            .address("Banjara Hills, Hyderabad")
                            .build());

                    UserAccount gAcc = UserAccount.builder()
                            .id(guardianId)
                            .loginId(guardianId)
                            .password(otpOnlyPlaceholder)
                            .name(guardianName)
                            .mobile(mobile)
                            .role(UserRole.PARENT)
                            .studentId(studentId)
                            .status("Active")
                            .active(true)
                            .linkedStudentIds(new ArrayList<>(List.of(studentId)))
                            .build();
                    guardianAccounts.add(gAcc);

                    guardianMemberships.add(SchoolMembership.builder()
                            .id("MEM-" + guardianId)
                            .accountId(guardianId)
                            .schoolId(FS)
                            .role(UserRole.PARENT)
                            .title("Parent / Guardian")
                            .active(true)
                            .build());

                    studentBatch.add(Student.builder()
                            .id(studentId)
                            .admissionNumber(admNo)
                            .name(studentName)
                            .dob(dob)
                            .gender(gender)
                            .classId(cs.id())
                            .className(cs.name())
                            .section(cs.section())
                            .roll(rollStr)
                            .parentAccountId(guardianId)
                            .parentName(guardianName)
                            .parentMobile(mobile)
                            .fatherName(guardianName)
                            .fatherMobile(mobile)
                            .mediumOfInstruction("English")
                            .secondLanguage("Hindi")
                            .transportRouteId(routeId)
                            .transportStop(stopName)
                            .status("Active")
                            .build());

                    enrollmentBatch.add(StudentEnrollment.builder()
                            .id("ENR-" + studentId + "-" + AY_ID)
                            .studentId(studentId)
                            .academicYearId(AY_ID)
                            .classId(cs.id())
                            .className(cs.name())
                            .section(cs.section())
                            .roll(rollStr)
                            .outcome("ENROLLED")
                            .source("NEW")
                            .createdAt(nowIso)
                            .createdBy("ACC-FS-ADM1")
                            .build());

                    for (FeeInstalment term : feeTerms) {
                        chargeBatch.add(FeeCharge.builder()
                                .id(studentId + "-SF-" + term.getNumber())
                                .studentId(studentId)
                                .category("SCHOOL_FEE")
                                .instalment(term.getNumber())
                                .label("School fee")
                                .amount(perTerm)
                                .dueOn(term.getDueOn())
                                .academicYearId(AY_ID)
                                .build());
                    }
                    if (cs.grade() == 10) {
                        chargeBatch.add(FeeCharge.builder()
                                .id(studentId + "-EX-4")
                                .studentId(studentId)
                                .category("EXAM_FEE")
                                .instalment(4)
                                .label("SSC board exam fee")
                                .amount(1500L)
                                .dueOn("2027-02-15")
                                .academicYearId(AY_ID)
                                .build());
                    }

                    // Rolls 01..20 per section have paid Term 1 via UPI/Counter
                    if (r <= 20) {
                        String chargeId = studentId + "-SF-1";
                        paymentBatch.add(FeePayment.builder()
                                .id("PAY-FS-" + seqStr)
                                .studentId(studentId)
                                .amount(perTerm)
                                .method(r % 2 == 0 ? "UPI" : "CASH")
                                .providerRef("FS-RCPT-" + seqStr)
                                .paidAt("2026-06-14T11:30:00+05:30")
                                .paidByGuardianId(guardianId)
                                .receiptNo("FS/2026-27/" + seqStr)
                                .mock(false)
                                .allocations(new ArrayList<>(List.of(new PaymentAllocation(chargeId, perTerm))))
                                .build());
                    }

                    for (LocalDate d : attDays) {
                        String morning;
                        String afternoon;
                        if (d.equals(today)) {
                            morning = "-";
                            afternoon = "-";
                        } else {
                            int v = (seq * 7 + d.getDayOfMonth()) % 100;
                            morning = v < 5 ? "A" : v < 8 ? "L" : "P";
                            afternoon = !"P".equals(morning) ? morning : v < 10 ? "A" : "P";
                        }
                        attendanceBatch.add(StudentAttendanceDay.builder()
                                .id(studentId + "-" + d)
                                .studentId(studentId)
                                .date(d.toString())
                                .morning(morning)
                                .afternoon(afternoon)
                                .build());
                    }
                }
            }

            accounts.saveAll(guardianAccounts);
            memberships.saveAll(guardianMemberships);
            parents.saveAll(parentBatch);
            students.saveAll(studentBatch);
            enrollments.saveAll(enrollmentBatch);
            charges.saveAll(chargeBatch);
            payments.saveAll(paymentBatch);
            attendance.saveAll(attendanceBatch);
        }

        if (exams.count() == 0) {
            exams.save(ExamWindow.builder()
                    .id("EX-FS-SA1")
                    .name("SA-1")
                    .startsOn(DemoDates.schoolDayIn(9).toString())
                    .gradesCsv("8,9,10")
                    .clearanceCategoriesCsv("SCHOOL_FEE")
                    .clearanceUptoInstalment(2)
                    .build());
        }

        if (assessments.count() == 0) {
            assessments.save(Assessment.builder()
                    .id("AS-FS-FA2")
                    .name("FA-2")
                    .academicYear("2026-27")
                    .gradesCsv("8,9,10")
                    .maxInternal(20)
                    .maxExternal(0)
                    .passPercent(35)
                    .secondLanguagePassPercent(20)
                    .secondLanguageSubjectsCsv("Hindi")
                    .status("OPEN")
                    .build());
        }

        if (notices.count() == 0) {
            String todayStr = LocalDate.now(ParentDataService.SCHOOL_ZONE).toString();
            notices.saveAll(List.of(
                    ClassNotice.builder().id("NT-FS-1").audienceCsv("ALL").priority("IMPORTANT")
                            .publishedAt(todayStr + "T08:30:00+05:30").publishedBy("ACC-FS-PRIN")
                            .title("SA-1 Timetable & Parent-Teacher Meeting Schedule")
                            .body("SA-1 assessments start in 9 school days for Classes 8, 9 & 10. Parent-Teacher Meeting will be held this Saturday from 10:00 AM to 1:00 PM.").build(),
                    ClassNotice.builder().id("NT-FS-2").audienceCsv("ALL").priority("NORMAL")
                            .publishedAt(LocalDate.now(ParentDataService.SCHOOL_ZONE).minusDays(2) + "T10:00:00+05:30").publishedBy("ACC-FS-ADM2")
                            .title("Annual Science & Innovation Fair Registrations")
                            .body("Students of Classes 8 to 10 interested in presenting Physical or Biological Science models can register with their respective subject teachers by Friday.").build(),
                    ClassNotice.builder().id("NT-FS-3").audienceCsv("FS-10-A,FS-10-B").priority("NORMAL")
                            .publishedAt(LocalDate.now(ParentDataService.SCHOOL_ZONE).minusDays(4) + "T14:00:00+05:30").publishedBy("STF-FS-05")
                            .title("Class 10 SSC Lab Record Submission")
                            .body("Bring signed Physical Science and Biological Science lab notebooks during the practical revision period.").build()
            ));
        }

        if (homework.count() == 0) {
            LocalDate t = LocalDate.now(ParentDataService.SCHOOL_ZONE);
            homework.saveAll(List.of(
                    HomeworkTask.builder().id("HW-FS-1").classId("FS-10-A").subject("Physical Science")
                            .teacherStaffId("STF-FS-05").teacherName("Ananya Deshmukh")
                            .title("Refraction & Lenses: 10 Numericals")
                            .instructions("Solve all 10 ray-diagram numericals in your science notebook.")
                            .assignedOn(t.minusDays(1).toString()).dueOn(t.plusDays(2).toString())
                            .submissionType("NOTEBOOK").statusJson("{}").build(),
                    HomeworkTask.builder().id("HW-FS-2").classId("FS-9-B").subject("Mathematics")
                            .teacherStaffId("STF-FS-04").teacherName("Srinivasulu Naidu")
                            .title("Linear Equations in Two Variables (Ex 4.2)")
                            .instructions("Complete questions 1 to 8 and plot the graphs.")
                            .assignedOn(t.minusDays(1).toString()).dueOn(t.plusDays(2).toString())
                            .submissionType("NOTEBOOK").statusJson("{}").build(),
                    HomeworkTask.builder().id("HW-FS-3").classId("FS-8-A").subject("Telugu")
                            .teacherStaffId("STF-FS-01").teacherName("Dr. Kavitha Rao")
                            .title("Padyalu memorisation & summary")
                            .instructions("Write summary of Lesson 4 in 150 words.")
                            .assignedOn(t.toString()).dueOn(t.plusDays(3).toString())
                            .submissionType("NOTEBOOK").statusJson("{}").build()
            ));
        }
    }

    private void archiveDemoSchools() {
        for (String legacy : List.of(DataInitializer.GVS, DataInitializer.SJM)) {
            schools.findById(legacy).ifPresent(sc -> {
                if (!"ARCHIVED".equals(sc.getStatus())) {
                    sc.setStatus("ARCHIVED");
                    schools.save(sc);
                }
            });
            List<SchoolMembership> legacyMembers = memberships.findBySchoolId(legacy);
            List<SchoolMembership> toDeactivate = legacyMembers.stream().filter(SchoolMembership::isActive).toList();
            if (!toDeactivate.isEmpty()) {
                toDeactivate.forEach(m -> m.setActive(false));
                memberships.saveAll(toDeactivate);
            }
        }
    }

    private UserAccount account(String id, String name, String email, String mobile, UserRole role, String pwdHash, List<String> children) {
        return accounts.findById(id).orElseGet(() -> UserAccount.builder()
                .id(id)
                .loginId(id)
                .password(pwdHash)
                .name(name)
                .email(email)
                .mobile(mobile)
                .role(role)
                .status("Active")
                .active(true)
                .linkedStudentIds(new ArrayList<>(children))
                .build());
    }

    private BusRoute busRoute(String id, String name, String vehicle, int capacity, String[][] stops) {
        List<Map<String, Object>> st = new ArrayList<>();
        for (String[] row : stops) st.add(Map.of("name", row[0], "pickup", row[1], "drop", row[2]));
        try {
            return BusRoute.builder().id(id).name(name).vehicleNo(vehicle).capacity(capacity)
                    .stopsJson(json.writeValueAsString(st)).feePerInstalment(1500L).build();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
