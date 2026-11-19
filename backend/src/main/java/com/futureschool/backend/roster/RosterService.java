package com.futureschool.backend.roster;

import com.futureschool.backend.entity.*;
import com.futureschool.backend.governance.GovernanceService;
import com.futureschool.backend.repository.*;
import com.futureschool.backend.school.SchoolOperationsService;
import com.futureschool.backend.security.SchoolPrincipal;
import com.futureschool.backend.service.StudentService;
import com.futureschool.backend.teaching.Teaching;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Start-of-year roster management for school admins (always the session's school: every read and
 * write below is school-filtered by @TenantId, so ids from another school are simply "not found").
 *
 *  1. Create the next academic year.
 *  2. Plan it: an explicit decision per current student (PROMOTE to the next grade, REPEAT the grade,
 *     or EXIT with a reason) plus newly joining students. Preview first (no writes), then apply.
 *     Apply writes nothing if any row has an error, and is safe to repeat (identical rows are skipped).
 *  3. Start the year: the plan takes effect (students move to their new class, leavers become Exited).
 *     Past-year enrollments are never rewritten; students, parents, attendance, marks and fee records
 *     are never deleted.
 *  4. Fees: a schedule (instalments + due dates inside the year) and charges per year, idempotently.
 *
 * Permissions: ADMISSIONS for years and the roster, FINANCE for fee schedules and charges.
 */
@Service
public class RosterService {

    private static final ZoneId SCHOOL_ZONE = ZoneId.of("Asia/Kolkata");
    private static final Pattern ROLL = Pattern.compile("^[A-Za-z0-9-]{1,16}$");
    private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
    static final String ACTIVE = "Active";
    static final String ADMITTED = "Admitted";

    private final Teaching t;
    private final AcademicYearService years;
    private final AcademicYearRepository yearRepo;
    private final StudentRepository students;
    private final SchoolClassRepository classes;
    private final StudentEnrollmentRepository enrollments;
    private final FeeInstalmentRepository instalments;
    private final FeeChargeRepository charges;
    private final UserAccountRepository accounts;
    private final StudentService studentService;
    private final SchoolOperationsService schoolOps;

    public RosterService(Teaching t, AcademicYearService years, AcademicYearRepository yearRepo, StudentRepository students, SchoolClassRepository classes,
                         StudentEnrollmentRepository enrollments, FeeInstalmentRepository instalments, FeeChargeRepository charges,
                         UserAccountRepository accounts, StudentService studentService, SchoolOperationsService schoolOps) {
        this.t = t;
        this.years = years;
        this.yearRepo = yearRepo;
        this.students = students;
        this.classes = classes;
        this.enrollments = enrollments;
        this.instalments = instalments;
        this.charges = charges;
        this.accounts = accounts;
        this.studentService = studentService;
        this.schoolOps = schoolOps;
    }

    // ================================================================== request rows

    /** One explicit decision for one current student. action: PROMOTE | REPEAT | EXIT. */
    public record Decision(String studentId, String action, String toClassId, String roll, String exitDate, String exitReason) {
    }

    /** A newly joining student and their guardian. */
    public record NewStudent(String admissionNumber, String name, String dob, String gender, String toClassId, String roll,
                             String guardianName, String guardianMobile, String guardianEmail, Long annualFee) {
    }

    public record Placement(String classId, String className, String section, String roll) {
    }

    /** status: OK (would be / was applied), SKIPPED (already in place, nothing to do), ERROR (needs correction). */
    public record Row(String ref, String studentId, String name, String action, String status, String message, Placement from, Placement to,
                      String guardian) {
    }

    // ================================================================== years

    @Transactional
    public Map<String, Object> listYears(SchoolPrincipal p) {
        requireLeadership(p);
        AcademicYear current = years.ensureCurrent();
        Map<String, Long> enrolled = new HashMap<>();
        for (AcademicYear y : years.all()) enrolled.put(y.getId(), (long) enrollments.findByAcademicYearId(y.getId()).size());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("current", yearView(current, current, enrolled));
        out.put("years", years.all().stream().map(y -> yearView(y, current, enrolled)).toList());
        return out;
    }

    @Transactional
    public Map<String, Object> createYear(SchoolPrincipal p, String name, String startDate, String endDate) {
        GovernanceService.requirePermission(p, "ADMISSIONS");
        AcademicYear current = years.ensureCurrent();
        int startYear = AcademicYearService.startYearOf(name);
        if (startYear < 0) throw Teaching.rule("BAD_YEAR", "Use the year format 2027-28.");
        String label = AcademicYearService.label(startYear);
        LocalDate start = date(startDate, "start date");
        LocalDate end = date(endDate, "end date");
        if (!end.isAfter(start)) throw Teaching.rule("BAD_DATES", "The end date must be after the start date.");
        long months = ChronoUnit.MONTHS.between(start, end);
        if (months < 6 || months > 14) throw Teaching.rule("BAD_DATES", "An academic year runs 6 to 14 months.");
        if (start.getYear() != startYear) throw Teaching.rule("BAD_DATES", "Academic year " + label + " should start in " + startYear + ".");
        String id = AcademicYearService.idFor(label);

        Optional<AcademicYear> existing = yearRepo.findById(id);
        if (existing.isPresent()) {
            AcademicYear y = existing.get();
            if (y.getStartDate().equals(start) && y.getEndDate().equals(end)) return yearView(y, current, Map.of()); // retry: nothing new
            throw Teaching.rule("YEAR_EXISTS", "Academic year " + label + " already exists with different dates.");
        }
        if (!start.isAfter(current.getStartDate())) throw Teaching.rule("BAD_DATES", "Prepare a year that starts after the current year " + current.getName() + ".");
        for (AcademicYear other : years.all()) {
            if (!start.isAfter(other.getEndDate()) && !end.isBefore(other.getStartDate())) {
                throw Teaching.rule("OVERLAP", "These dates overlap academic year " + other.getName() + ".");
            }
        }
        AcademicYear y = yearRepo.save(AcademicYear.builder().id(id).name(label).startDate(start).endDate(end).isCurrent(false).build());
        t.record(p, "ACADEMIC_YEAR_CREATED", id, "Academic year " + label + " prepared (" + start + " to " + end + ").", null);
        return yearView(y, current, Map.of());
    }

    // ================================================================== plan: draft, preview, apply

    /** The current roster with a suggestion per student and any decision already saved for the target year. */
    @Transactional
    public Map<String, Object> draft(SchoolPrincipal p, String yearId) {
        requireLeadership(p);
        AcademicYear current = years.ensureCurrent();
        AcademicYear target = year(yearId);
        List<SchoolClass> active = classes.findByActiveTrueOrderByGradeNumberAscSectionAsc();
        Map<String, SchoolClass> byId = active.stream().collect(Collectors.toMap(SchoolClass::getId, c -> c));
        Map<String, StudentEnrollment> currentRows = byStudent(enrollments.findByAcademicYearId(current.getId()));
        Map<String, StudentEnrollment> targetRows = byStudent(enrollments.findByAcademicYearId(target.getId()));

        List<Map<String, Object>> roster = new ArrayList<>();
        boolean planning = isPlanned(target, current);
        if (planning) {
            for (Student s : students.findByStatusIn(List.of(ACTIVE))) {
                SchoolClass now = byId.get(s.getClassId());
                Integer grade = now == null ? null : now.getGradeNumber();
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("studentId", s.getId());
                m.put("name", s.getName());
                m.put("admissionNumber", s.getAdmissionNumber());
                m.put("current", new Placement(s.getClassId(), s.getClassName(), s.getSection(), s.getRoll()));
                m.put("grade", grade);
                StudentEnrollment cur = currentRows.get(s.getId());
                StudentEnrollment next = targetRows.get(s.getId());
                Map<String, Object> saved = savedDecision(cur, next);
                if (saved != null) m.put("saved", saved);
                // A suggestion only (the admin decides): same section in the next grade, keeping the roll number.
                SchoolClass up = grade == null ? null : active.stream()
                        .filter(c -> Objects.equals(c.getGradeNumber(), grade + 1) && c.getSection().equalsIgnoreCase(s.getSection())).findFirst().orElse(null);
                if (up != null) m.put("suggestion", Map.of("action", "PROMOTE", "toClassId", up.getId(), "roll", s.getRoll() == null ? "" : s.getRoll()));
                else m.put("needsDecision", grade == null ? "This student's class is missing or inactive." : "No class " + (grade + 1) + "-" + s.getSection()
                        + " exists. Choose a class, repeat the grade, or mark the student as leaving.");
                roster.add(m);
            }
            roster.sort(Comparator.comparing((Map<String, Object> m) -> String.valueOf(((Placement) m.get("current")).className()))
                    .thenComparing(m -> ((Placement) m.get("current")).section()).thenComparing(m -> pad(((Placement) m.get("current")).roll())));
        }
        List<Map<String, Object>> admitted = targetRows.values().stream().filter(e -> "NEW".equals(e.getSource())).map(e -> {
            Student s = students.findById(e.getStudentId()).orElse(null);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("studentId", e.getStudentId());
            m.put("name", s == null ? e.getStudentId() : s.getName());
            m.put("admissionNumber", s == null ? null : s.getAdmissionNumber());
            m.put("to", new Placement(e.getClassId(), e.getClassName(), e.getSection(), e.getRoll()));
            m.put("guardianLinked", s != null && s.getParentAccountId() != null);
            return m;
        }).toList();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("year", yearView(target, current, Map.of()));
        out.put("currentYear", yearView(current, current, Map.of()));
        out.put("planning", planning);
        out.put("classes", active.stream().map(c -> Map.of("id", c.getId(), "name", c.getName(), "section", c.getSection(),
                "grade", c.getGradeNumber() == null ? 0 : c.getGradeNumber())).toList());
        out.put("roster", roster);
        out.put("admitted", admitted);
        out.put("schedule", scheduleView(target, current));
        return out;
    }

    @Transactional
    public Map<String, Object> preview(SchoolPrincipal p, String yearId, List<Decision> decisions, List<NewStudent> newStudents) {
        GovernanceService.requirePermission(p, "ADMISSIONS");
        return plan(p, yearId, decisions, newStudents, true);
    }

    @Transactional
    public Map<String, Object> apply(SchoolPrincipal p, String yearId, List<Decision> decisions, List<NewStudent> newStudents) {
        GovernanceService.requirePermission(p, "ADMISSIONS");
        return plan(p, yearId, decisions, newStudents, false);
    }

    private Map<String, Object> plan(SchoolPrincipal p, String yearId, List<Decision> decisionsIn, List<NewStudent> newIn, boolean dryRun) {
        AcademicYear current = years.ensureCurrent();
        AcademicYear target = year(yearId);
        List<Decision> decisions = decisionsIn == null ? List.of() : decisionsIn;
        List<NewStudent> newcomers = newIn == null ? List.of() : newIn;
        if (decisions.isEmpty() && newcomers.isEmpty()) throw Teaching.rule("EMPTY", "Add at least one decision or new student.");
        if (decisions.size() + newcomers.size() > 2000) throw Teaching.rule("TOO_MANY", "Send at most 2000 rows at a time.");
        boolean planning = isPlanned(target, current);
        if (!decisions.isEmpty() && !planning) {
            throw Teaching.rule("NOT_PLANNED_YEAR", "Promotions and exits are planned for the next academic year, before it starts.");
        }
        if (isPast(target, current)) throw Teaching.rule("PAST_YEAR", "Academic year " + target.getName() + " is over; its records cannot change.");

        Map<String, SchoolClass> classById = classes.findByActiveTrueOrderByGradeNumberAscSectionAsc().stream().collect(Collectors.toMap(SchoolClass::getId, c -> c));
        Map<String, StudentEnrollment> targetRows = byStudent(enrollments.findByAcademicYearId(target.getId()));
        Map<String, StudentEnrollment> currentRows = byStudent(enrollments.findByAcademicYearId(current.getId()));
        // Roll numbers already taken in the target year, per class (students not in this batch keep theirs).
        Set<String> batchStudents = decisions.stream().map(Decision::studentId).filter(Objects::nonNull).collect(Collectors.toSet());
        Map<String, String> takenRolls = new HashMap<>(); // classId|ROLL -> studentId
        for (StudentEnrollment e : targetRows.values()) {
            if (!batchStudents.contains(e.getStudentId())) takenRolls.put(rollKey(e.getClassId(), e.getRoll()), e.getStudentId());
        }

        List<Row> rows = new ArrayList<>();
        List<Runnable> writes = new ArrayList<>();
        Map<String, Integer> counts = new LinkedHashMap<>(Map.of("promoted", 0, "repeated", 0, "added", 0, "exited", 0, "skipped", 0, "needsCorrection", 0));
        Set<String> seen = new HashSet<>();

        // ---------------------------------------------------------- returning students
        for (int i = 0; i < decisions.size(); i++) {
            Decision d = decisions.get(i);
            String ref = "decision " + (i + 1);
            String sid = trim(d.studentId());
            Student s = sid.isEmpty() ? null : students.findById(sid).orElse(null);
            if (s == null) {
                rows.add(error(ref, sid, null, d.action(), "Student not found in this school."));
                continue;
            }
            Placement from = new Placement(s.getClassId(), s.getClassName(), s.getSection(), s.getRoll());
            if (!seen.add(s.getId())) {
                rows.add(error(ref, s.getId(), s.getName(), d.action(), "This student appears twice in the plan.", from, null));
                continue;
            }
            if (!ACTIVE.equalsIgnoreCase(s.getStatus())) {
                rows.add(error(ref, s.getId(), s.getName(), d.action(), "Only active students can be promoted, kept back or exited (status: " + s.getStatus() + ").", from, null));
                continue;
            }
            String action = trim(d.action()).toUpperCase(Locale.ROOT);
            SchoolClass now = classById.get(s.getClassId());
            StudentEnrollment existingTarget = targetRows.get(s.getId());
            StudentEnrollment existingCurrent = currentRows.get(s.getId());

            if ("EXIT".equals(action)) {
                String reason = trim(d.exitReason());
                if (reason.length() < 3) {
                    rows.add(error(ref, s.getId(), s.getName(), action, "Give the reason the student is leaving (for example: transferred, did not return).", from, null));
                    continue;
                }
                String exitDate = trim(d.exitDate()).isEmpty() ? current.getEndDate().toString() : trim(d.exitDate());
                LocalDate ed = parseOrNull(exitDate);
                if (ed == null || ed.isAfter(target.getStartDate())) {
                    rows.add(error(ref, s.getId(), s.getName(), action, "The exit date must be a date on or before " + target.getStartDate() + ".", from, null));
                    continue;
                }
                boolean same = existingTarget == null && existingCurrent != null && "EXITED".equals(existingCurrent.getOutcome())
                        && Objects.equals(existingCurrent.getExitReason(), reason) && Objects.equals(existingCurrent.getExitDate(), exitDate);
                if (same) {
                    rows.add(new Row(ref, s.getId(), s.getName(), action, "SKIPPED", "Already marked as leaving.", from, null, null));
                    counts.merge("skipped", 1, Integer::sum);
                    continue;
                }
                rows.add(new Row(ref, s.getId(), s.getName(), action, "OK", "Leaves on " + exitDate + ": " + reason + ". Records are kept.", from, null, null));
                counts.merge("exited", 1, Integer::sum);
                writes.add(() -> {
                    StudentEnrollment cur = snapshot(s, current, p);
                    cur.setOutcome("EXITED");
                    cur.setExitDate(exitDate);
                    cur.setExitReason(reason.length() > 255 ? reason.substring(0, 255) : reason);
                    enrollments.save(cur);
                    if (existingTarget != null) enrollments.delete(existingTarget); // a not-yet-started plan, not history
                    t.record(p, "STUDENT_EXIT_PLANNED", s.getId(), "Leaves at the end of " + current.getName() + " (" + exitDate + ").", reason);
                });
                continue;
            }
            if (!"PROMOTE".equals(action) && !"REPEAT".equals(action)) {
                rows.add(error(ref, s.getId(), s.getName(), d.action(), "Choose promote, repeat or exit.", from, null));
                continue;
            }
            SchoolClass to = classById.get(trim(d.toClassId()));
            if (to == null) {
                rows.add(error(ref, s.getId(), s.getName(), action, "Choose the class for " + target.getName() + ".", from, null));
                continue;
            }
            if (now == null || now.getGradeNumber() == null || to.getGradeNumber() == null) {
                rows.add(error(ref, s.getId(), s.getName(), action, "The student's current class is missing; fix it before planning.", from, null));
                continue;
            }
            int expected = "PROMOTE".equals(action) ? now.getGradeNumber() + 1 : now.getGradeNumber();
            if (!to.getGradeNumber().equals(expected)) {
                rows.add(error(ref, s.getId(), s.getName(), action, ("PROMOTE".equals(action) ? "Promotion goes to class " : "Repeating stays in class ") + expected
                        + ", not " + to.getGradeNumber() + ".", from, null));
                continue;
            }
            String roll = trim(d.roll());
            String rollErr = rollError(roll, to, takenRolls, s.getId());
            Placement dest = new Placement(to.getId(), to.getName(), to.getSection(), roll);
            if (rollErr != null) {
                rows.add(error(ref, s.getId(), s.getName(), action, rollErr, from, dest));
                continue;
            }
            takenRolls.put(rollKey(to.getId(), roll), s.getId());
            String outcome = "PROMOTE".equals(action) ? "PROMOTED" : "REPEATED";
            boolean same = existingTarget != null && existingTarget.getClassId().equals(to.getId()) && existingTarget.getRoll().equalsIgnoreCase(roll)
                    && existingCurrent != null && outcome.equals(existingCurrent.getOutcome());
            if (same) {
                rows.add(new Row(ref, s.getId(), s.getName(), action, "SKIPPED", "Already planned.", from, dest, null));
                counts.merge("skipped", 1, Integer::sum);
                continue;
            }
            rows.add(new Row(ref, s.getId(), s.getName(), action, "OK", existingTarget != null ? "Plan updated." : null, from, dest, null));
            counts.merge("PROMOTE".equals(action) ? "promoted" : "repeated", 1, Integer::sum);
            writes.add(() -> {
                StudentEnrollment cur = snapshot(s, current, p);
                cur.setOutcome(outcome);
                cur.setExitDate(null);
                cur.setExitReason(null);
                enrollments.save(cur);
                StudentEnrollment next = existingTarget != null ? existingTarget : StudentEnrollment.builder()
                        .id(enrollmentId(target, s.getId())).studentId(s.getId()).academicYearId(target.getId()).source("RETURNING")
                        .createdAt(Teaching.now()).createdBy(p.account().getId()).build();
                next.setClassId(to.getId());
                next.setClassName(to.getName());
                next.setSection(to.getSection());
                next.setRoll(roll);
                next.setOutcome("ENROLLED");
                enrollments.save(next);
            });
        }

        // ---------------------------------------------------------- newly joining students
        Set<String> seenAdm = new HashSet<>();
        for (int i = 0; i < newcomers.size(); i++) {
            NewStudent n = newcomers.get(i);
            String ref = "new student " + (i + 1);
            String name = trim(n.name());
            String adm = trim(n.admissionNumber());
            List<String> problems = new ArrayList<>();
            if (name.length() < 2) problems.add("Enter the student's name.");
            if (adm.isEmpty()) problems.add("Enter the admission number.");
            else if (adm.length() > 64) problems.add("The admission number is too long.");
            else if (!seenAdm.add(adm.toUpperCase(Locale.ROOT))) problems.add("Admission number " + adm + " appears twice in the plan.");
            SchoolClass to = classById.get(trim(n.toClassId()));
            if (to == null) problems.add("Choose the class for " + target.getName() + ".");
            String roll = trim(n.roll());
            Optional<Student> byAdm = adm.isEmpty() ? Optional.empty() : students.findByAdmissionNumber(adm);
            // On a retry the roll is held by this same (already added) student, which is not a clash.
            String who = byAdm.map(Student::getId).orElse("new:" + adm);
            if (to != null) {
                String rollErr = rollError(roll, to, takenRolls, who);
                if (rollErr != null) problems.add(rollErr);
            }
            // Guardian: parent access is by this mobile number (OTP, then the parent sets a PIN).
            String guardianName = trim(n.guardianName());
            String mobile = digits10(n.guardianMobile());
            if (guardianName.length() < 2) problems.add("Enter the parent or guardian's name.");
            if (trim(n.guardianMobile()).isEmpty()) problems.add("Enter the parent's mobile number; without it the parent cannot sign in.");
            else if (mobile == null) problems.add("The parent's mobile number must be 10 digits starting with 6, 7, 8 or 9; the parent cannot sign in without it.");
            String email = trim(n.guardianEmail());
            if (!email.isEmpty() && !EMAIL.matcher(email).matches()) problems.add("The parent's email address is not valid.");
            String dob = trim(n.dob());
            if (!dob.isEmpty() && parseOrNull(dob) == null) problems.add("Date of birth must be a date (YYYY-MM-DD).");
            long fee = n.annualFee() == null ? 0 : n.annualFee();
            if (fee < 0) problems.add("The annual fee cannot be negative.");
            Placement dest = to == null ? null : new Placement(to.getId(), to.getName(), to.getSection(), roll);

            if (byAdm.isPresent()) {
                Student existing = byAdm.get();
                StudentEnrollment e = targetRows.get(existing.getId());
                if (e != null && "NEW".equals(e.getSource()) && problems.isEmpty() && existing.getName().equalsIgnoreCase(name)) {
                    rows.add(new Row(ref, existing.getId(), existing.getName(), "ADD", "SKIPPED", "Already added for " + target.getName() + ".",
                            null, new Placement(e.getClassId(), e.getClassName(), e.getSection(), e.getRoll()), null));
                    counts.merge("skipped", 1, Integer::sum);
                    continue;
                }
                problems.add("Admission number " + adm + " already belongs to another student. A returning student is planned in the roster above, not added again.");
            }
            if (!problems.isEmpty()) {
                rows.add(error(ref, null, name, "ADD", String.join(" ", problems), null, dest));
                continue;
            }
            takenRolls.put(rollKey(to.getId(), roll), "new:" + adm);
            boolean existingParent = accounts.findByMobile(mobile).stream().anyMatch(a -> a.getRole() == UserRole.PARENT);
            String guardianNote = existingParent
                    ? "Linked to the existing parent account for " + mask(mobile) + "."
                    : "A parent account will be created for " + mask(mobile) + ". The parent signs in with this number (OTP), then sets a PIN.";
            boolean noSchedule = fee > 0 && StudentService.scheduleFor(instalments, target.getId(), current.getId()).isEmpty();
            rows.add(new Row(ref, null, name, "ADD", "OK", noSchedule ? "No fee schedule for " + target.getName() + " yet, so no fees are charged now." : null,
                    null, dest, guardianNote));
            counts.merge("added", 1, Integer::sum);
            final SchoolClass toClass = to;
            final String guardianMobile = mobile;
            writes.add(() -> {
                UserAccount parent = schoolOps.ensureParentAccount(t.school(), guardianMobile, guardianName, email, null);
                boolean startsNow = target.getId().equals(current.getId());
                Student created = studentService.createStudent(Student.builder()
                        .admissionNumber(adm).name(name).dob(dob.isEmpty() ? null : dob).gender(trim(n.gender()).isEmpty() ? null : trim(n.gender()))
                        .classId(toClass.getId()).className(toClass.getName()).section(toClass.getSection()).roll(roll)
                        .parentAccountId(parent.getLoginId()).parentName(guardianName).parentMobile(guardianMobile).parentEmail(email.isEmpty() ? null : email)
                        .feeBalance(0.0).status(startsNow ? ACTIVE : ADMITTED).build(), null);
                enrollments.save(StudentEnrollment.builder().id(enrollmentId(target, created.getId())).studentId(created.getId())
                        .academicYearId(target.getId()).classId(toClass.getId()).className(toClass.getName()).section(toClass.getSection()).roll(roll)
                        .outcome("ENROLLED").source("NEW").createdAt(Teaching.now()).createdBy(p.account().getId()).build());
                if (fee > 0) StudentService.provisionYearFees(instalments, charges, created, fee, target.getId(), current.getId());
                t.record(p, "STUDENT_ADMITTED", created.getId(), "Admitted to " + toClass.getName() + "-" + toClass.getSection() + " for " + target.getName() + ".", null);
                t.record(p, "GUARDIAN_LINKED", created.getId(), existingParent ? "Linked to an existing parent account." : "New parent account created; sign-in by mobile OTP.", null);
            });
        }

        long errors = rows.stream().filter(r -> "ERROR".equals(r.status())).count();
        counts.put("needsCorrection", (int) errors);
        // Nothing is written when any row needs correction, so a plan never lands half-applied.
        boolean applied = !dryRun && errors == 0 && !writes.isEmpty();
        if (applied) {
            writes.forEach(Runnable::run);
            t.record(p, "ROSTER_PLAN_APPLIED", target.getId(), "Plan for " + target.getName() + ": " + counts.get("promoted") + " promoted, "
                    + counts.get("repeated") + " repeating, " + counts.get("added") + " added, " + counts.get("exited") + " leaving, "
                    + counts.get("skipped") + " unchanged.", null);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("dryRun", dryRun);
        out.put("applied", applied);
        out.put("year", yearView(target, current, Map.of()));
        out.put("summary", counts);
        out.put("rows", rows);
        if (!dryRun && errors > 0) out.put("message", errors + " row(s) need correction. Nothing was saved.");
        if (planning) out.put("undecided", undecided(current, target, decisions, applied));
        return out;
    }

    // ================================================================== start the year

    @Transactional
    public Map<String, Object> start(SchoolPrincipal p, String yearId) {
        GovernanceService.requirePermission(p, "ADMISSIONS");
        AcademicYear current = years.ensureCurrent();
        AcademicYear target = year(yearId);
        if (target.getId().equals(current.getId())) {
            return Map.of("started", false, "alreadyCurrent", true, "message", target.getName() + " is already the current year.");
        }
        if (!isPlanned(target, current)) throw Teaching.rule("NOT_PLANNED_YEAR", "Only the next academic year can be started.");
        List<Map<String, Object>> open = undecided(current, target, List.of(), false);
        if (!open.isEmpty()) {
            throw Teaching.rule("UNDECIDED", open.size() + " student(s) have no decision for " + target.getName() + ". Promote, keep back or mark each as leaving first.");
        }
        years.stampLegacyRows(current.getId()); // last year's fee rows stay last year's

        Map<String, StudentEnrollment> currentRows = byStudent(enrollments.findByAcademicYearId(current.getId()));
        int exited = 0;
        for (StudentEnrollment e : currentRows.values()) {
            if (!"EXITED".equals(e.getOutcome())) continue;
            Student s = students.findById(e.getStudentId()).orElse(null);
            if (s == null || !ACTIVE.equalsIgnoreCase(s.getStatus())) continue;
            studentService.recordExit(s.getId(), e.getExitDate(), e.getExitReason(), null); // deactivates the student login; keeps all records
            Student x = students.findById(s.getId()).orElseThrow();
            x.setStatus("Exited");
            students.save(x);
            t.record(p, "STUDENT_EXITED", s.getId(), "Left at the end of " + current.getName() + ".", e.getExitReason());
            exited++;
        }
        int moved = 0;
        int joined = 0;
        for (StudentEnrollment e : enrollments.findByAcademicYearId(target.getId())) {
            Student s = students.findById(e.getStudentId()).orElse(null);
            // Someone who left after the plan was made is not brought back.
            if (s == null || !(ACTIVE.equalsIgnoreCase(s.getStatus()) || ADMITTED.equalsIgnoreCase(s.getStatus()))) continue;
            s.setClassId(e.getClassId());
            s.setClassName(e.getClassName());
            s.setSection(e.getSection());
            s.setRoll(e.getRoll());
            if (ADMITTED.equalsIgnoreCase(s.getStatus())) {
                s.setStatus(ACTIVE);
                joined++;
            } else {
                moved++;
            }
            students.save(s);
        }
        current.setCurrent(false);
        yearRepo.save(current);
        target.setCurrent(true);
        yearRepo.save(target);
        t.record(p, "ACADEMIC_YEAR_STARTED", target.getId(), target.getName() + " started: " + moved + " returning, " + joined + " new, " + exited + " left.", null);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("started", true);
        out.put("year", target.getName());
        out.put("returning", moved);
        out.put("joined", joined);
        out.put("exited", exited);
        return out;
    }

    // ================================================================== fees per year

    public record ScheduleItem(Integer number, String label, String dueOn) {
    }

    @Transactional
    public Map<String, Object> setFeeSchedule(SchoolPrincipal p, String yearId, List<ScheduleItem> items) {
        GovernanceService.requirePermission(p, "FINANCE");
        AcademicYear current = years.ensureCurrent();
        AcademicYear y = year(yearId);
        if (isPast(y, current)) throw Teaching.rule("PAST_YEAR", "Academic year " + y.getName() + " is over; its fee schedule cannot change.");
        if (items == null || items.isEmpty()) throw Teaching.rule("EMPTY", "Add at least one instalment.");
        if (items.size() > 12) throw Teaching.rule("TOO_MANY", "Use at most 12 instalments.");
        Set<Integer> numbers = new HashSet<>();
        for (ScheduleItem i : items) {
            if (i.number() == null || i.number() < 1 || i.number() > 12) throw Teaching.rule("BAD_SCHEDULE", "Instalment numbers run from 1 to 12.");
            if (!numbers.add(i.number())) throw Teaching.rule("BAD_SCHEDULE", "Instalment " + i.number() + " appears twice.");
            String label = trim(i.label());
            if (label.length() < 2 || label.length() > 64) throw Teaching.rule("BAD_SCHEDULE", "Give instalment " + i.number() + " a name (for example: Term 1).");
            LocalDate due = parseOrNull(trim(i.dueOn()));
            if (due == null) throw Teaching.rule("BAD_SCHEDULE", "Instalment " + i.number() + " needs a due date (YYYY-MM-DD).");
            if (due.isBefore(y.getStartDate()) || due.isAfter(y.getEndDate())) {
                throw Teaching.rule("BAD_SCHEDULE", "Instalment " + i.number() + " is due on " + due + ", outside " + y.getName() + " (" + y.getStartDate() + " to " + y.getEndDate() + ").");
            }
        }
        List<FeeInstalment> existing = StudentService.scheduleFor(instalments, y.getId(), current.getId());
        List<FeeCharge> yearCharges = charges.findAll().stream().filter(c -> AcademicYearService.sameYear(c.getAcademicYearId(), y.getId(), current.getId())).toList();
        for (FeeInstalment old : existing) {
            if (!numbers.contains(old.getNumber()) && yearCharges.stream().anyMatch(c -> c.getInstalment().equals(old.getNumber()))) {
                throw Teaching.rule("IN_USE", old.getLabel() + " already has fee charges; keep it in the schedule.");
            }
        }
        for (FeeInstalment old : existing) if (!numbers.contains(old.getNumber())) instalments.delete(old);
        for (ScheduleItem i : items) {
            String due = LocalDate.parse(trim(i.dueOn())).toString();
            FeeInstalment ins = existing.stream().filter(x -> x.getNumber().equals(i.number())).findFirst()
                    .orElseGet(() -> FeeInstalment.builder().id(t.school() + "-" + y.getId() + "-INS-" + i.number()).number(i.number()).build());
            ins.setLabel(trim(i.label()));
            ins.setDueOn(due);
            ins.setAcademicYearId(y.getId());
            instalments.save(ins);
            // Charges of this year and instalment follow the schedule's due date.
            yearCharges.stream().filter(c -> c.getInstalment().equals(i.number()) && !due.equals(c.getDueOn())).forEach(c -> {
                c.setDueOn(due);
                charges.save(c);
            });
        }
        t.record(p, "FEE_SCHEDULE_SET", y.getId(), "Fee schedule for " + y.getName() + ": " + items.size() + " instalment(s).", null);
        return Map.of("year", yearView(y, current, Map.of()), "schedule", scheduleView(y, current));
    }

    /**
     * School fee charges for everyone enrolled in the year, from an annual fee per grade, split over the
     * year's schedule. Safe to repeat: students already charged for the year are skipped.
     */
    @Transactional
    public Map<String, Object> generateCharges(SchoolPrincipal p, String yearId, Map<String, Long> annualFeeByGrade) {
        GovernanceService.requirePermission(p, "FINANCE");
        AcademicYear current = years.ensureCurrent();
        AcademicYear y = year(yearId);
        if (isPast(y, current)) throw Teaching.rule("PAST_YEAR", "Academic year " + y.getName() + " is over.");
        if (StudentService.scheduleFor(instalments, y.getId(), current.getId()).isEmpty()) {
            throw Teaching.rule("NO_SCHEDULE", "Set up the fee schedule for " + y.getName() + " first.");
        }
        Map<Integer, Long> fees = new HashMap<>();
        if (annualFeeByGrade != null) annualFeeByGrade.forEach((k, v) -> {
            int g;
            try {
                g = Integer.parseInt(k.trim());
            } catch (NumberFormatException e) {
                throw Teaching.rule("BAD_FEE", "Grades are numbers 1 to 12.");
            }
            if (g < 1 || g > 12) throw Teaching.rule("BAD_FEE", "Grades are numbers 1 to 12.");
            if (v == null || v < 0) throw Teaching.rule("BAD_FEE", "The fee for class " + g + " cannot be negative.");
            fees.put(g, v);
        });
        if (fees.isEmpty()) throw Teaching.rule("BAD_FEE", "Enter the annual fee for at least one class.");
        if (y.getId().equals(current.getId())) {
            for (Student s : students.findByStatusIn(List.of(ACTIVE))) snapshot(s, current, p);
        }
        Map<String, SchoolClass> classById = classes.findAll().stream().collect(Collectors.toMap(SchoolClass::getId, c -> c));
        int created = 0, skipped = 0;
        Set<Integer> missing = new TreeSet<>();
        for (StudentEnrollment e : enrollments.findByAcademicYearId(y.getId())) {
            if ("EXITED".equals(e.getOutcome()) && !y.getId().equals(current.getId())) continue;
            Student s = students.findById(e.getStudentId()).orElse(null);
            if (s == null || !(ACTIVE.equalsIgnoreCase(s.getStatus()) || ADMITTED.equalsIgnoreCase(s.getStatus()))) continue;
            SchoolClass c = classById.get(e.getClassId());
            Integer g = c == null ? null : c.getGradeNumber();
            Long fee = g == null ? null : fees.get(g);
            if (fee == null) {
                if (g != null) missing.add(g);
                skipped++;
                continue;
            }
            int n = StudentService.provisionYearFees(instalments, charges, s, fee, y.getId(), current.getId());
            if (n > 0) created++;
            else skipped++;
        }
        t.record(p, "FEE_CHARGES_GENERATED", y.getId(), "School fee charged for " + y.getName() + ": " + created + " student(s), " + skipped + " skipped.", null);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("year", y.getName());
        out.put("studentsCharged", created);
        out.put("skipped", skipped);
        out.put("gradesWithoutFee", missing);
        return out;
    }

    // ================================================================== helpers

    private void requireLeadership(SchoolPrincipal p) {
        if (!Teaching.isLeadership(p)) throw Teaching.denied("Only the Principal or Admin can view the academic-year roster.");
    }

    private AcademicYear year(String id) {
        return years.byId(id).orElseThrow(() -> Teaching.rule("NOT_FOUND", "Academic year not found."));
    }

    private static boolean isPlanned(AcademicYear y, AcademicYear current) {
        return !y.getId().equals(current.getId()) && y.getStartDate().isAfter(current.getStartDate());
    }

    private static boolean isPast(AcademicYear y, AcademicYear current) {
        return !y.getId().equals(current.getId()) && y.getStartDate().isBefore(current.getStartDate());
    }

    private Map<String, Object> yearView(AcademicYear y, AcademicYear current, Map<String, Long> enrolled) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", y.getId());
        m.put("name", y.getName());
        m.put("startDate", y.getStartDate().toString());
        m.put("endDate", y.getEndDate().toString());
        m.put("status", y.getId().equals(current.getId()) ? "CURRENT" : isPlanned(y, current) ? "PLANNED" : "PAST");
        if (enrolled.containsKey(y.getId())) m.put("enrolled", enrolled.get(y.getId()));
        return m;
    }

    private List<Map<String, Object>> scheduleView(AcademicYear y, AcademicYear current) {
        return StudentService.scheduleFor(instalments, y.getId(), current.getId()).stream()
                .map(i -> Map.<String, Object>of("number", i.getNumber(), "label", i.getLabel(), "dueOn", i.getDueOn())).toList();
    }

    /** The current-year enrollment row for a student, recorded from the live roster if it is missing. */
    private StudentEnrollment snapshot(Student s, AcademicYear current, SchoolPrincipal p) {
        return enrollments.findByStudentIdAndAcademicYearId(s.getId(), current.getId()).orElseGet(() -> enrollments.save(StudentEnrollment.builder()
                .id(enrollmentId(current, s.getId())).studentId(s.getId()).academicYearId(current.getId())
                .classId(s.getClassId()).className(s.getClassName()).section(s.getSection()).roll(s.getRoll() == null ? "-" : s.getRoll())
                .outcome("ENROLLED").source("SNAPSHOT").createdAt(Teaching.now()).createdBy(p.account().getId()).build()));
    }

    /** Active students without a decision for the target year (after this batch, when it was applied). */
    private List<Map<String, Object>> undecided(AcademicYear current, AcademicYear target, List<Decision> batch, boolean batchApplied) {
        Map<String, StudentEnrollment> cur = byStudent(enrollments.findByAcademicYearId(current.getId()));
        Map<String, StudentEnrollment> next = byStudent(enrollments.findByAcademicYearId(target.getId()));
        Set<String> inBatch = batch.stream().map(Decision::studentId).filter(Objects::nonNull).collect(Collectors.toSet());
        List<Map<String, Object>> out = new ArrayList<>();
        for (Student s : students.findByStatusIn(List.of(ACTIVE))) {
            StudentEnrollment c = cur.get(s.getId());
            boolean decided = next.containsKey(s.getId()) || (c != null && "EXITED".equals(c.getOutcome()));
            if (decided || (!batchApplied && inBatch.contains(s.getId()))) continue;
            out.add(Map.of("studentId", s.getId(), "name", s.getName(), "className", String.valueOf(s.getClassName()), "section", String.valueOf(s.getSection())));
        }
        return out;
    }

    private static Map<String, Object> savedDecision(StudentEnrollment cur, StudentEnrollment next) {
        if (cur != null && "EXITED".equals(cur.getOutcome())) {
            return Map.of("action", "EXIT", "exitDate", String.valueOf(cur.getExitDate()), "exitReason", String.valueOf(cur.getExitReason()));
        }
        if (next == null) return null;
        String action = cur != null && "REPEATED".equals(cur.getOutcome()) ? "REPEAT" : "PROMOTE";
        return Map.of("action", action, "toClassId", next.getClassId(), "roll", next.getRoll());
    }

    private String rollError(String roll, SchoolClass to, Map<String, String> taken, String who) {
        if (roll.isEmpty()) return "Enter the roll number in " + to.getName() + "-" + to.getSection() + ".";
        if (!ROLL.matcher(roll).matches()) return "Roll numbers use letters, digits or '-' (up to 16).";
        String holder = taken.get(rollKey(to.getId(), roll));
        if (holder != null && !holder.equals(who)) return "Roll " + roll + " is already taken in " + to.getName() + "-" + to.getSection() + ".";
        return null;
    }

    private static String rollKey(String classId, String roll) {
        String r = roll == null ? "" : roll.trim().toUpperCase(Locale.ROOT).replaceFirst("^0+(?=.)", "");
        return classId + "|" + r;
    }

    private static String enrollmentId(AcademicYear y, String studentId) {
        return "ENR-" + y.getId() + "-" + studentId;
    }

    private static Map<String, StudentEnrollment> byStudent(List<StudentEnrollment> list) {
        return list.stream().collect(Collectors.toMap(StudentEnrollment::getStudentId, Function.identity(), (a, b) -> a));
    }

    private static Row error(String ref, String studentId, String name, String action, String message) {
        return new Row(ref, studentId, name, action, "ERROR", message, null, null, null);
    }

    private static Row error(String ref, String studentId, String name, String action, String message, Placement from, Placement to) {
        return new Row(ref, studentId, name, action, "ERROR", message, from, to, null);
    }

    private static LocalDate date(String v, String what) {
        LocalDate d = parseOrNull(trim(v));
        if (d == null) throw Teaching.rule("BAD_DATES", "Enter the " + what + " as YYYY-MM-DD.");
        return d;
    }

    private static LocalDate parseOrNull(String v) {
        if (v == null || v.isBlank()) return null;
        try {
            return LocalDate.parse(v.trim());
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    private static String trim(String v) {
        return v == null ? "" : v.trim();
    }

    private static String pad(String roll) {
        String r = roll == null ? "" : roll;
        return r.matches("\\d+") ? String.format("%08d", Integer.parseInt(r.length() > 8 ? r.substring(0, 8) : r)) : r;
    }

    /** An Indian mobile number as 10 digits (a +91 / 0 prefix is accepted), or null when invalid. */
    static String digits10(String raw) {
        if (raw == null) return null;
        String d = raw.replaceAll("\\D", "");
        if (d.length() == 12 && d.startsWith("91")) d = d.substring(2);
        if (d.length() == 11 && d.startsWith("0")) d = d.substring(1);
        return d.matches("[6-9]\\d{9}") ? d : null;
    }

    /** "98••••••10": enough for the admin to recognise the number, never the full number in responses. */
    static String mask(String mobile10) {
        return mobile10 == null || mobile10.length() < 4 ? "••••" : mobile10.substring(0, 2) + "••••••" + mobile10.substring(mobile10.length() - 2);
    }

    static LocalDate today() {
        return LocalDate.now(SCHOOL_ZONE);
    }
}
