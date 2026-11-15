package com.futureschool.backend.school;

import com.fasterxml.jackson.core.type.TypeReference;
import com.futureschool.backend.entity.*;
import com.futureschool.backend.governance.GovernanceService;
import com.futureschool.backend.leave.LeaveService;
import com.futureschool.backend.parent.ParentDataService;
import com.futureschool.backend.parent.ParentViews.FeeLine;
import com.futureschool.backend.repository.*;
import com.futureschool.backend.security.SchoolPrincipal;
import com.futureschool.backend.service.MembershipService;
import com.futureschool.backend.service.StudentService;
import com.futureschool.backend.teaching.Teaching;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.Year;
import java.util.*;
import java.util.stream.Collectors;

/**
 * School-level operations backed by the live database:
 * - Current school profile & settings (/api/schools/current)
 * - Live Principal & Admin school overview (/api/staff/overview)
 * - Live Admin work queue (/api/office/work-queue)
 * - Bulk student/parent/class CSV onboarding (/api/admin/students/import)
 * - Class teacher & subject teacher allocations (/api/admin/academics/*)
 */
@Service
public class SchoolOperationsService {

    private static final Map<String, String> PERMISSION_FOR_KIND = Map.of(
            "FEE_CONCESSION", "FINANCE",
            "REFUND", "FINANCE",
            "LATE_FEE_WAIVER", "FINANCE",
            "FEE_STRUCTURE", "FINANCE",
            "EXAM_SCHEDULE", "ACADEMIC_OPS",
            "CLEARANCE_RULE", "ACADEMIC_OPS"
    );

    private final Teaching t;
    private final SchoolRepository schools;
    private final SchoolSettingRepository settings;
    private final AcademicYearRepository academicYears;
    private final SchoolClassRepository classes;
    private final ClassSubjectTeacherRepository subjectTeachers;
    private final StudentRepository students;
    private final ParentRepository parents;
    private final UserAccountRepository accounts;
    private final SchoolMembershipRepository memberships;
    private final MembershipService membershipService;
    private final PasswordEncoder passwordEncoder;
    private final StudentService studentService;
    private final AttendanceRegisterRepository registers;
    private final AssessmentRepository assessments;
    private final MarksSheetRepository sheets;
    private final ReportCardRepository cards;
    private final FeeInstalmentRepository instalments;
    private final ExamWindowRepository exams;
    private final TeacherLeaveRequestRepository teacherLeaves;
    private final MarkCorrectionRepository corrections;
    private final ChangeRequestRepository changeRequests;
    private final ComplaintCaseRepository complaints;
    private final TransportRequestRepository transportRequests;
    private final ParentDataService parentData;
    private final LeaveService leaveService;

    public SchoolOperationsService(
            Teaching t,
            SchoolRepository schools,
            SchoolSettingRepository settings,
            AcademicYearRepository academicYears,
            SchoolClassRepository classes,
            ClassSubjectTeacherRepository subjectTeachers,
            StudentRepository students,
            ParentRepository parents,
            UserAccountRepository accounts,
            SchoolMembershipRepository memberships,
            MembershipService membershipService,
            PasswordEncoder passwordEncoder,
            StudentService studentService,
            AttendanceRegisterRepository registers,
            AssessmentRepository assessments,
            MarksSheetRepository sheets,
            ReportCardRepository cards,
            FeeInstalmentRepository instalments,
            ExamWindowRepository exams,
            TeacherLeaveRequestRepository teacherLeaves,
            MarkCorrectionRepository corrections,
            ChangeRequestRepository changeRequests,
            ComplaintCaseRepository complaints,
            TransportRequestRepository transportRequests,
            ParentDataService parentData,
            LeaveService leaveService
    ) {
        this.t = t;
        this.schools = schools;
        this.settings = settings;
        this.academicYears = academicYears;
        this.classes = classes;
        this.subjectTeachers = subjectTeachers;
        this.students = students;
        this.parents = parents;
        this.accounts = accounts;
        this.memberships = memberships;
        this.membershipService = membershipService;
        this.passwordEncoder = passwordEncoder;
        this.studentService = studentService;
        this.registers = registers;
        this.assessments = assessments;
        this.sheets = sheets;
        this.cards = cards;
        this.instalments = instalments;
        this.exams = exams;
        this.teacherLeaves = teacherLeaves;
        this.corrections = corrections;
        this.changeRequests = changeRequests;
        this.complaints = complaints;
        this.transportRequests = transportRequests;
        this.parentData = parentData;
        this.leaveService = leaveService;
    }

    // ================================================================== school profile

    @Transactional(readOnly = true)
    public Map<String, Object> currentProfile() {
        String sid = t.school();
        School s = schools.findById(sid).orElseThrow(() -> Teaching.denied("School not found."));
        SchoolSetting st = settings.findById("SET-" + sid).or(() -> settings.findById("DEFAULT")).orElse(null);
        AcademicYear ay = academicYears.findByIsCurrentTrue().orElse(null);

        String name = s.getName();
        String address = st != null && st.getAddress() != null && !st.getAddress().isBlank() ? st.getAddress() : "India";
        String city = extractSegment(address, 1, "Hyderabad");
        String district = extractSegment(address, 1, city);
        String state = extractSegment(address, 2, "Telangana");

        String ayId = ay != null ? ay.getId() : "AY-2026-27";
        String ayLabel = ay != null ? ay.getName() : "2026-27";
        String ayStart = ay != null ? ay.getStartDate().toString() : "2026-06-12";
        String ayEnd = ay != null ? ay.getEndDate().toString() : "2027-04-23";

        Map<String, Object> academicYearMap = new LinkedHashMap<>();
        academicYearMap.put("id", ayId);
        academicYearMap.put("label", ayLabel);
        academicYearMap.put("startsOn", ayStart);
        academicYearMap.put("endsOn", ayEnd);
        academicYearMap.put("status", "ACTIVE");

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", s.getId());
        out.put("name", name);
        out.put("shortName", shortenName(name));
        out.put("city", city);
        out.put("district", district);
        out.put("state", state);
        if (st != null && st.getAffiliationNumber() != null) out.put("udiseCode", st.getAffiliationNumber());
        out.put("boardProfileId", s.getBoard() != null ? s.getBoard() : "STATE_SSC");
        out.put("academicYear", academicYearMap);
        out.put("branding", Map.of("primary", "#1d4ed8", "accent", "#ea580c"));
        out.put("contact", Map.of(
                "phone", st != null && st.getPhone() != null ? st.getPhone() : "+91 40 0000 1001",
                "email", st != null && st.getEmail() != null ? st.getEmail() : "office@" + sid.toLowerCase(Locale.ROOT) + ".edu.in",
                "address", address
        ));
        if (s.getLateFeePolicy() != null) out.put("lateFeePolicy", s.getLateFeePolicy());
        return out;
    }

    @Transactional
    public Map<String, Object> updateProfile(SchoolPrincipal p, Map<String, Object> body) {
        if (p.role() != UserRole.PRINCIPAL) {
            GovernanceService.requireAnyPermission(p, "ACADEMIC_OPS", "REPORTS", "SECURITY");
        }
        String sid = t.school();
        School s = schools.findById(sid).orElseThrow(() -> Teaching.denied("School not found."));
        if (body.get("name") instanceof String nm && !nm.isBlank()) s.setName(nm.trim());
        if (body.get("lateFeePolicy") instanceof String lfp) s.setLateFeePolicy(lfp.trim());
        schools.save(s);

        SchoolSetting st = settings.findById("SET-" + sid).orElseGet(() -> SchoolSetting.builder().id("SET-" + sid).build());
        st.setSchoolName(s.getName());
        if (body.get("address") instanceof String a && !a.isBlank()) st.setAddress(a.trim());
        if (body.get("phone") instanceof String ph && !ph.isBlank()) st.setPhone(ph.trim());
        if (body.get("email") instanceof String em && !em.isBlank()) st.setEmail(em.trim());
        settings.save(st);

        t.record(p, "SCHOOL_PROFILE_UPDATED", sid, "Updated school profile and contact settings.", null);
        return currentProfile();
    }

    // ================================================================== live overview & work queue

    @Transactional(readOnly = true)
    public Map<String, Object> staffOverview(SchoolPrincipal p) {
        if (!Teaching.isLeadership(p)) throw Teaching.denied("Only Principal or Admin can view school overview.");
        LocalDate d = LocalDate.now(ParentDataService.SCHOOL_ZONE);
        if (d.getDayOfWeek() == DayOfWeek.SUNDAY) d = d.minusDays(1);
        String targetDate = d.toString();
        String today = ParentDataService.today();

        List<Student> activeStudents = students.findAll().stream().filter(s -> "Active".equalsIgnoreCase(s.getStatus())).toList();
        Set<String> populatedClassIds = activeStudents.stream().map(Student::getClassId).filter(Objects::nonNull).collect(Collectors.toSet());
        List<SchoolClass> activeClasses = classes.findByActiveTrueOrderByGradeNumberAscSectionAsc().stream()
                .filter(c -> populatedClassIds.contains(c.getId()) || c.getClassTeacherId() != null)
                .toList();

        List<AttendanceRegister> dayRegs = registers.findAll().stream().filter(r -> targetDate.equals(r.getDate())).toList();
        int totalMarks = 0;
        int presentMarks = 0;
        for (AttendanceRegister r : dayRegs) {
            Map<String, String> marks = t.read(r.getMarksJson(), new TypeReference<>() {});
            for (String v : marks.values()) {
                totalMarks++;
                if ("P".equals(v) || "L".equals(v) || "LATE".equals(v)) presentMarks++;
            }
        }
        Map<String, Object> attendance = new LinkedHashMap<>();
        attendance.put("date", targetDate);
        attendance.put("classesTotal", activeClasses.size());
        attendance.put("morningTaken", (int) dayRegs.stream().filter(r -> "MORNING".equals(r.getSession())).count());
        attendance.put("afternoonTaken", (int) dayRegs.stream().filter(r -> "AFTERNOON".equals(r.getSession())).count());
        attendance.put("presentPct", totalMarks > 0 ? Math.round((presentMarks * 1000.0) / totalMarks) / 10.0 : null);

        List<Assessment> allAssessments = assessments.findAll();
        List<Map<String, Object>> academics = new ArrayList<>();
        for (SchoolClass c : activeClasses) {
            int grade = c.getGradeNumber() == null ? 0 : c.getGradeNumber();
            int subjectCount = subjectTeachers.findByClassIdOrderByIdAsc(c.getId()).size();
            for (Assessment a : allAssessments) {
                if (!gradesOf(a.getGradesCsv()).contains(grade)) continue;
                List<MarksSheet> cs = sheets.findByAssessmentIdAndClassId(a.getId(), c.getId());
                List<ReportCard> cr = cards.findByAssessmentIdAndClassId(a.getId(), c.getId());
                Map<String, Long> byStatus = cr.stream().collect(Collectors.groupingBy(ReportCard::getStatus, Collectors.counting()));
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("classLabel", grade + "-" + c.getSection());
                row.put("classTeacher", c.getClassTeacherName() != null ? c.getClassTeacherName() : "Unassigned");
                row.put("assessment", a.getName());
                row.put("subjectsAccepted", (int) cs.stream().filter(s -> "ACCEPTED".equals(s.getStatus())).count());
                row.put("subjectsTotal", subjectCount);
                row.put("cards", byStatus);
                row.put("published", !cr.isEmpty() && cr.stream().allMatch(rc -> "PUBLISHED".equals(rc.getStatus())));
                academics.add(row);
            }
        }

        List<FeeLine> allLines = activeStudents.stream().flatMap(s -> parentData.feeLines(s.getId(), today).stream()).toList();
        List<FeeInstalment> terms = instalments.findAllByOrderByNumberAsc();
        List<Map<String, Object>> byInstalment = new ArrayList<>();
        for (FeeInstalment ins : terms) {
            List<FeeLine> ls = allLines.stream().filter(l -> l.charge().instalment() == ins.getNumber()).toList();
            long due = ls.stream().mapToLong(l -> Math.max(0, l.charge().amount() - l.concession())).sum();
            long col = ls.stream().mapToLong(FeeLine::paid).sum();
            byInstalment.add(Map.of("label", "Term " + ins.getNumber(), "due", due, "collected", col));
        }
        Map<String, Object> finance = new LinkedHashMap<>();
        finance.put("charged", allLines.stream().mapToLong(l -> l.charge().amount()).sum());
        finance.put("concession", allLines.stream().mapToLong(FeeLine::concession).sum());
        finance.put("collected", allLines.stream().mapToLong(FeeLine::paid).sum());
        finance.put("outstanding", allLines.stream().mapToLong(FeeLine::outstanding).sum());
        finance.put("overdue", allLines.stream().filter(FeeLine::overdue).mapToLong(FeeLine::outstanding).sum());
        finance.put("byInstalment", byInstalment);

        List<Map<String, Object>> hallTickets = new ArrayList<>();
        for (ExamWindow ex : exams.findByStartsOnGreaterThanEqualOrderByStartsOnAsc(today)) {
            List<Integer> exGrades = gradesOf(ex.getGradesCsv());
            List<Student> eligible = activeStudents.stream().filter(st -> exGrades.contains(ParentDataService.gradeOf(st))).toList();
            int cleared = 0;
            int released = 0;
            for (Student st : eligible) {
                var ht = parentData.hallTicket(ex, st, ParentDataService.gradeOf(st), today);
                if ("CLEARED".equals(ht.feeClearance())) cleared++;
                if (ht.release() != null) released++;
            }
            hallTickets.add(Map.of("exam", ex.getName(), "startsOn", ex.getStartsOn(), "students", eligible.size(), "cleared", cleared, "released", released));
        }

        Map<String, Object> counts = new LinkedHashMap<>();
        counts.put("reportCards", (int) cards.findAll().stream().filter(c -> "SUBMITTED".equals(c.getStatus())).count());
        counts.put("corrections", (int) corrections.findAll().stream().filter(c -> "VERIFIED".equals(c.getStatus())).count());
        counts.put("teacherLeave", (int) teacherLeaves.findAll().stream().filter(l -> "PENDING".equals(l.getStatus())).count());
        counts.put("governance", (int) changeRequests.findAll().stream().filter(r -> "PENDING_APPROVAL".equals(r.getStatus())).count());

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("attendance", attendance);
        out.put("academics", academics);
        out.put("finance", finance);
        out.put("hallTickets", hallTickets);
        out.put("counts", counts);
        return out;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> adminWorkQueue(SchoolPrincipal p) {
        if (p.role() != UserRole.ADMIN) throw Teaching.denied("Only Admins have a work queue.");
        List<String> perms = GovernanceService.permissions(p);
        List<ChangeRequest> mine = changeRequests.findAll().stream()
                .filter(r -> perms.contains(PERMISSION_FOR_KIND.get(r.getKind())))
                .toList();

        long toExecute = mine.stream().filter(r -> "APPROVED".equals(r.getStatus()) && Objects.equals(r.getPayloadHash(), r.getApprovedHash())).count();
        long blocked = mine.stream().filter(r -> "EXECUTION_BLOCKED".equals(r.getStatus()) || ("APPROVED".equals(r.getStatus()) && !Objects.equals(r.getPayloadHash(), r.getApprovedHash()))).count();
        long returned = mine.stream().filter(r -> "RETURNED".equals(r.getStatus())).count();
        long drafts = mine.stream().filter(r -> "DRAFT".equals(r.getStatus())).count();
        long waitingPrincipal = mine.stream().filter(r -> "PENDING_APPROVAL".equals(r.getStatus())).count();

        int uncovered = 0;
        if (perms.contains("ACADEMIC_OPS")) {
            uncovered = (int) leaveService.substitutionNeeds(p).stream().filter(n -> !n.containsKey("assigned")).count();
        }
        int complaintsOpen = 0;
        int safetyComplaints = 0;
        if (perms.contains("COMPLAINTS")) {
            List<ComplaintCase> active = complaints.findAll().stream()
                    .filter(c -> List.of("OPEN", "IN_PROGRESS", "REOPENED").contains(c.getStatus()))
                    .toList();
            complaintsOpen = active.size();
            safetyComplaints = (int) active.stream().filter(c -> "SAFETY".equals(c.getCategory())).count();
        }
        int transportPending = perms.contains("TRANSPORT")
                ? (int) transportRequests.findAll().stream().filter(r -> "PENDING".equals(r.getStatus())).count()
                : 0;

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("governance", Map.of(
                "toExecute", toExecute,
                "blocked", blocked,
                "returned", returned,
                "drafts", drafts,
                "waitingPrincipal", waitingPrincipal
        ));
        out.put("substitutionsUncovered", uncovered);
        out.put("complaintsOpen", complaintsOpen);
        out.put("safetyComplaints", safetyComplaints);
        out.put("transportPending", transportPending);
        return out;
    }

    // ================================================================== bulk CSV student import

    @Transactional
    public Map<String, Object> importStudentsCsv(SchoolPrincipal p, String csv, long defaultAnnualFee) {
        GovernanceService.requirePermission(p, "ADMISSIONS");
        if (csv == null || csv.isBlank()) throw Teaching.rule("EMPTY_CSV", "Upload or paste a CSV file first.");
        String cleaned = csv.startsWith("\uFEFF") ? csv.substring(1) : csv;
        List<List<String>> rows = parseCsv(cleaned);
        if (rows.size() < 2) throw Teaching.rule("EMPTY_CSV", "Include a header row and at least one student row.");

        List<String> headers = rows.get(0).stream().map(SchoolOperationsService::normHeader).toList();
        Map<String, Integer> idx = new HashMap<>();
        for (int i = 0; i < headers.size(); i++) idx.putIfAbsent(headers.get(i), i);
        if (!idx.containsKey("name") && !idx.containsKey("studentname")) {
            throw Teaching.rule("BAD_HEADER", "Missing required column: Student Name.");
        }

        String school = t.school();
        int year = Year.now().getValue();
        int createdCount = 0;
        int skippedCount = 0;
        int classesCreated = 0;
        int parentsLinked = 0;
        List<Map<String, Object>> errors = new ArrayList<>();
        List<String> createdStudentIds = new ArrayList<>();

        for (int r = 1; r < rows.size(); r++) {
            List<String> cols = rows.get(r);
            if (cols.stream().allMatch(String::isBlank)) continue;
            int rowNum = r + 1;
            try {
                String name = col(cols, idx, "studentname", "name");
                String gradeRaw = col(cols, idx, "grade", "class", "classname");
                String section = col(cols, idx, "section");
                if (name.isBlank()) throw new IllegalArgumentException("Student name is required.");
                int grade = parseGrade(gradeRaw);
                if (grade < 1 || grade > 12) throw new IllegalArgumentException("Class/grade must be 1 to 12.");
                String sec = section.isBlank() ? "A" : section.trim().toUpperCase(Locale.ROOT);

                String parentMobileRaw = col(cols, idx, "parentmobile", "mobile", "fathermobile", "mothermobile");
                String mobile10 = digits10(parentMobileRaw);
                if (!parentMobileRaw.isBlank() && mobile10 == null) {
                    throw new IllegalArgumentException("Parent mobile must be a 10-digit number.");
                }
                String aadhaarRaw = col(cols, idx, "aadhaarnumber", "aadhaarno", "aadhaar");
                String aadhaar = aadhaarRaw.replaceAll("\\D", "");
                if (!aadhaarRaw.isBlank() && aadhaar.length() != 12) {
                    throw new IllegalArgumentException("Aadhaar must be 12 digits.");
                }
                String pinRaw = col(cols, idx, "pincode", "pin");
                String pin = pinRaw.replaceAll("\\D", "");
                if (!pinRaw.isBlank() && pin.length() != 6) {
                    throw new IllegalArgumentException("PIN code must be 6 digits.");
                }

                String classId = school + "-" + grade + "-" + sec;
                SchoolClass sc = classes.findById(classId).or(() -> classes.findByNameAndSection("Class " + grade, sec)).orElse(null);
                if (sc == null) {
                    sc = classes.save(SchoolClass.builder()
                            .id(classId).name("Class " + grade).section(sec).gradeNumber(grade)
                            .schoolLevel(grade >= 9 ? "Senior" : "Middle").active(true).build());
                    classesCreated++;
                }

                String admNo = col(cols, idx, "admissionno", "admissionnumber");
                if (!admNo.isBlank() && students.findByAdmissionNumber(admNo).isPresent()) {
                    skippedCount++;
                    errors.add(Map.of("row", rowNum, "message", "Skipped duplicate admission number " + admNo));
                    continue;
                }

                String parentName = col(cols, idx, "parentname", "fathername", "mothername");
                String parentEmail = col(cols, idx, "parentemail", "email");
                String parentAccountId = null;
                if (mobile10 != null) {
                    String effectiveParentName = !parentName.isBlank() ? parentName : "Parent of " + name;
                    UserAccount acc = ensureParentAccount(school, mobile10, effectiveParentName, parentEmail, col(cols, idx, "address"));
                    parentAccountId = acc.getLoginId();
                    parentsLinked++;
                }

                long fee = parseLongOrDefault(col(cols, idx, "annualfee", "fee"), defaultAnnualFee);
                Student st = Student.builder()
                        .id(nextStudentId(school, year))
                        .admissionNumber(admNo.isBlank() ? null : admNo)
                        .name(name)
                        .dob(blankToNull(col(cols, idx, "dob", "dateofbirth")))
                        .gender(blankToNull(col(cols, idx, "gender")))
                        .classId(sc.getId())
                        .className(sc.getName())
                        .section(sc.getSection())
                        .roll(col(cols, idx, "rollno", "roll", "rollnumber").isBlank() ? String.format("%02d", (int) (students.countByClassId(sc.getId()) + 1)) : col(cols, idx, "rollno", "roll", "rollnumber"))
                        .parentAccountId(parentAccountId)
                        .parentName(blankToNull(!parentName.isBlank() ? parentName : col(cols, idx, "fathername")))
                        .parentMobile(mobile10)
                        .parentEmail(blankToNull(parentEmail))
                        .aadhaarNumber(aadhaar.isEmpty() ? null : aadhaar)
                        .apaarId(blankToNull(col(cols, idx, "apaarid", "apaar")))
                        .casteCategory(blankToNull(col(cols, idx, "socialcategory", "castecategory", "category")))
                        .subCaste(blankToNull(col(cols, idx, "subcaste")))
                        .religion(blankToNull(col(cols, idx, "religion")))
                        .motherTongue(blankToNull(col(cols, idx, "mothertongue")))
                        .fatherName(blankToNull(col(cols, idx, "fathername")))
                        .motherName(blankToNull(col(cols, idx, "mothername")))
                        .mediumOfInstruction(blankToNull(col(cols, idx, "mediumofinstruction", "medium")))
                        .secondLanguage(blankToNull(col(cols, idx, "secondlanguage")))
                        .address(blankToNull(col(cols, idx, "address")))
                        .district(blankToNull(col(cols, idx, "district")))
                        .mandal(blankToNull(col(cols, idx, "mandal")))
                        .pincode(pin.isEmpty() ? null : pin)
                        .feeBalance(fee > 0 ? (double) fee : 0.0)
                        .status("Active")
                        .build();

                Student created = studentService.createStudent(st, null);
                createdCount++;
                createdStudentIds.add(created.getId());
            } catch (Exception e) {
                errors.add(Map.of("row", rowNum, "message", e.getMessage() != null ? e.getMessage() : "Invalid row"));
            }
        }

        t.record(p, "STUDENTS_BULK_IMPORTED", school, "CSV import: " + createdCount + " created, " + skippedCount + " skipped, " + errors.size() + " warnings/errors.", null);
        return Map.of(
                "createdCount", createdCount,
                "skippedCount", skippedCount,
                "classesCreated", classesCreated,
                "parentsLinked", parentsLinked,
                "errors", errors,
                "createdStudentIds", createdStudentIds
        );
    }

    // ================================================================== class & subject-teacher setup

    @Transactional(readOnly = true)
    public Map<String, Object> academicsSetup(SchoolPrincipal p) {
        if (!Teaching.isLeadership(p)) throw Teaching.denied("Only Principal or Admin can view class setup.");
        List<Teaching.ClassSection> classSections = classes.findByActiveTrueOrderByGradeNumberAscSectionAsc().stream().map(t::view).toList();
        List<Map<String, Object>> teacherList = memberships.findBySchoolIdAndRole(t.school(), UserRole.TEACHER).stream()
                .filter(SchoolMembership::isActive)
                .map(m -> accounts.findById(m.getAccountId()).map(a -> {
                    Map<String, Object> tm = new LinkedHashMap<>();
                    tm.put("staffId", a.getId());
                    tm.put("name", a.getName());
                    tm.put("title", m.getTitle() != null ? m.getTitle() : "Teacher");
                    return tm;
                }).orElse(null))
                .filter(Objects::nonNull)
                .sorted(Comparator.comparing(m -> m.get("name").toString()))
                .toList();
        return Map.of("classes", classSections, "teachers", teacherList);
    }

    @Transactional
    public Teaching.ClassSection assignSubjectTeacher(SchoolPrincipal p, String classId, String subject, String staffId) {
        GovernanceService.requirePermission(p, "ACADEMIC_OPS");
        SchoolClass c = t.classOrThrow(classId);
        if (subject == null || subject.isBlank() || staffId == null || staffId.isBlank()) {
            throw Teaching.rule("MISSING_FIELDS", "Select a class, subject, and teacher.");
        }
        UserAccount teacher = accounts.findById(staffId).orElseThrow(() -> Teaching.rule("NOT_FOUND", "Teacher not found."));
        if (!memberships.existsByAccountIdAndSchoolIdAndRole(teacher.getId(), t.school(), UserRole.TEACHER)) {
            throw Teaching.denied("Teacher does not belong to this school.");
        }
        String sub = subject.trim();
        ClassSubjectTeacher existing = subjectTeachers.findByClassIdOrderByIdAsc(c.getId()).stream()
                .filter(st -> st.getSubject().equalsIgnoreCase(sub))
                .findFirst().orElse(null);
        if (existing != null) {
            existing.setStaffId(teacher.getId());
            existing.setStaffName(teacher.getName());
            subjectTeachers.save(existing);
        } else {
            subjectTeachers.save(ClassSubjectTeacher.builder()
                    .id("CST-" + c.getId() + "-" + UUID.randomUUID().toString().substring(0, 6))
                    .classId(c.getId())
                    .subject(sub)
                    .staffId(teacher.getId())
                    .staffName(teacher.getName())
                    .build());
        }
        t.record(p, "SUBJECT_TEACHER_ASSIGNED", c.getId(), sub + " assigned to " + teacher.getName(), null);
        return t.view(c);
    }

    // ================================================================== helpers

    private UserAccount ensureParentAccount(String school, String mobile10, String name, String email, String address) {
        UserAccount acc = accounts.findByMobile(mobile10).stream()
                .filter(a -> a.getRole() == UserRole.PARENT)
                .findFirst()
                .orElseGet(() -> {
                    String gid = "GRD-" + school + "-" + mobile10.substring(6) + "-" + String.format("%03d", (int) (parents.count() + 1));
                    while (accounts.existsById(gid) || accounts.existsByLoginIdIgnoreCase(gid)) gid = gid + "x";
                    return accounts.save(UserAccount.builder()
                            .id(gid).loginId(gid).password(passwordEncoder.encode(membershipService.unusablePassword()))
                            .name(name).mobile(mobile10).email(blankToNull(email))
                            .role(UserRole.PARENT).status("Active").active(true).linkedStudentIds(new ArrayList<>()).build());
                });
        membershipService.ensure(acc, UserRole.PARENT, "Parent / Guardian");
        if (parents.findByLoginIdIgnoreCase(acc.getLoginId()).isEmpty()) {
            parents.save(Parent.builder().id(school + "-" + acc.getLoginId()).loginId(acc.getLoginId())
                    .name(acc.getName()).mobile(mobile10).email(blankToNull(email)).address(blankToNull(address)).build());
        }
        return acc;
    }

    private String nextStudentId(String school, int year) {
        long seq = students.count() + 1;
        String id = school + "-" + year + "-" + String.format("%04d", seq);
        while (students.existsById(id) || accounts.existsByLoginIdIgnoreCase(id)) {
            id = school + "-" + year + "-" + String.format("%04d", ++seq);
        }
        return id;
    }

    private static List<Integer> gradesOf(String csv) {
        if (csv == null || csv.isBlank()) return List.of();
        return Arrays.stream(csv.split(",")).map(String::trim).filter(s -> !s.isEmpty()).map(Integer::parseInt).toList();
    }

    private static String extractSegment(String address, int idx, String fallback) {
        String[] parts = address.split(",");
        if (parts.length > idx && !parts[idx].trim().isEmpty()) return parts[idx].trim();
        return fallback;
    }

    private static String shortenName(String name) {
        return name.replaceAll("(?i)\\s+(High|Model|Public|International)?\\s*School$", "").trim();
    }

    private static String normHeader(String h) {
        return h == null ? "" : h.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }

    private static String col(List<String> cols, Map<String, Integer> idx, String... aliases) {
        for (String a : aliases) {
            Integer i = idx.get(a);
            if (i != null && i < cols.size()) {
                String v = cols.get(i).trim();
                if (!v.isEmpty()) return v;
            }
        }
        return "";
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static String digits10(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String d = raw.replaceAll("\\D", "");
        if (d.length() > 10) d = d.substring(d.length() - 10);
        return d.length() == 10 ? d : null;
    }

    private static int parseGrade(String raw) {
        if (raw == null || raw.isBlank()) return 0;
        String d = raw.replaceAll("\\D", "");
        return d.isEmpty() ? 0 : Integer.parseInt(d);
    }

    private static long parseLongOrDefault(String raw, long def) {
        if (raw == null || raw.isBlank()) return def;
        try {
            return Long.parseLong(raw.replaceAll("\\D", ""));
        } catch (NumberFormatException e) {
            return def;
        }
    }

    static List<List<String>> parseCsv(String csv) {
        List<List<String>> rows = new ArrayList<>();
        List<String> currentRow = new ArrayList<>();
        StringBuilder field = new StringBuilder();
        boolean inQuotes = false;
        for (int i = 0; i < csv.length(); i++) {
            char c = csv.charAt(i);
            if (inQuotes) {
                if (c == '"') {
                    if (i + 1 < csv.length() && csv.charAt(i + 1) == '"') {
                        field.append('"');
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    field.append(c);
                }
            } else if (c == '"') {
                inQuotes = true;
            } else if (c == ',') {
                currentRow.add(field.toString());
                field.setLength(0);
            } else if (c == '\r') {
                // ignore CR; wait for LF or EOF
            } else if (c == '\n') {
                currentRow.add(field.toString());
                rows.add(currentRow);
                currentRow = new ArrayList<>();
                field.setLength(0);
            } else {
                field.append(c);
            }
        }
        if (field.length() > 0 || !currentRow.isEmpty()) {
            currentRow.add(field.toString());
            rows.add(currentRow);
        }
        return rows;
    }
}
