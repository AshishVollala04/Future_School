package com.futureschool.backend.leave;

import com.fasterxml.jackson.core.type.TypeReference;
import com.futureschool.backend.entity.*;
import com.futureschool.backend.governance.GovernanceService;
import com.futureschool.backend.parent.ParentDataService;
import com.futureschool.backend.repository.*;
import com.futureschool.backend.security.SchoolPrincipal;
import com.futureschool.backend.teaching.Teaching;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * Leave, timetable and substitution.
 *
 * Student leave (Flow 1): parent applies for the SESSION child -> that class's Class Teacher
 *   approves/rejects. Approved leave is context in the register, never applied automatically.
 * Teacher leave (Flow 6): teacher applies -> Principal approves/rejects -> Admin with ACADEMIC_OPS
 *   assigns a FREE teacher to every period (not teaching, not on leave, not already substituting).
 *   The substitute sees the duty on their Today screen.
 */
@Service
public class LeaveService {

    private static final Set<String> STUDENT_KINDS = Set.of("SICK", "FAMILY", "MEDICAL_APPOINTMENT", "OTHER");
    private static final Set<String> TEACHER_KINDS = Set.of("CASUAL", "SICK", "TRAINING", "OTHER");
    private static final int MAX_DAYS = 15;
    private static final TypeReference<List<Map<String, Object>>> LIST = new TypeReference<>() {
    };
    static final DayOfWeek[] DAYS = {DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY};

    private final Teaching t;
    private final StudentLeaveRepository studentLeaves;
    private final TeacherLeaveRequestRepository teacherLeaves;
    private final TimetableSlotRepository timetable;
    private final ClassSubjectTeacherRepository subjectTeachers;

    public LeaveService(Teaching t, StudentLeaveRepository studentLeaves, TeacherLeaveRequestRepository teacherLeaves,
                        TimetableSlotRepository timetable, ClassSubjectTeacherRepository subjectTeachers) {
        this.t = t;
        this.studentLeaves = studentLeaves;
        this.teacherLeaves = teacherLeaves;
        this.timetable = timetable;
        this.subjectTeachers = subjectTeachers;
    }

    private static LocalDate today() {
        return LocalDate.now(ParentDataService.SCHOOL_ZONE);
    }

    private static LocalDate date(String s, String what) {
        try {
            return LocalDate.parse(s);
        } catch (Exception e) {
            throw Teaching.rule("DATES", "Choose the " + what + ".");
        }
    }

    // ================================================================== student leave

    public Map<String, Object> studentView(StudentLeave l) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", l.getId());
        m.put("schoolId", l.getSchoolId());
        m.put("studentId", l.getStudentId());
        m.put("classSectionId", l.getClassId());
        m.put("fromDate", l.getFromDate());
        m.put("toDate", l.getToDate());
        m.put("kind", l.getKind());
        m.put("reason", l.getReason());
        m.put("requestedByGuardianId", l.getRequestedByGuardianId());
        m.put("requestedAt", l.getRequestedAt());
        m.put("status", l.getStatus());
        if (l.getDecidedBy() != null) {
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("by", l.getDecidedBy());
            d.put("byName", l.getDecidedByName());
            d.put("at", l.getDecidedAt());
            if (l.getDecisionNote() != null) d.put("note", l.getDecisionNote());
            m.put("decision", d);
        }
        return m;
    }

    private Student sessionChild(SchoolPrincipal p) {
        if (p.role() != UserRole.PARENT || p.sessionStudentId() == null) throw Teaching.denied("Leave is applied by the parent.");
        return t.students().findById(p.sessionStudentId()).orElseThrow(() -> Teaching.denied("Student not found."));
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> listForChild(SchoolPrincipal p) {
        Student s = sessionChild(p);
        return studentLeaves.findAll().stream().filter(l -> l.getStudentId().equals(s.getId()))
                .sorted(Comparator.comparing(StudentLeave::getRequestedAt).reversed()).map(this::studentView).toList();
    }

    @Transactional
    public Map<String, Object> apply(SchoolPrincipal p, String from, String to, String kind, String reason) {
        Student s = sessionChild(p);
        LocalDate f = date(from, "dates"), e = date(to, "dates");
        if (e.isBefore(f)) throw Teaching.rule("DATES", "The end date is before the start date.");
        if (f.isBefore(today().minusDays(7))) throw Teaching.rule("DATES", "Leave can be applied up to 7 days after the absence.");
        if (ChronoUnit.DAYS.between(f, e) + 1 > MAX_DAYS) throw Teaching.rule("DATES", "For more than " + MAX_DAYS + " days, please contact the school office.");
        if (kind == null || !STUDENT_KINDS.contains(kind)) throw Teaching.rule("KIND", "Choose the type of leave.");
        String r = reason == null ? "" : reason.trim();
        if (r.length() < 5) throw Teaching.rule("REASON", "Add a short reason.");
        boolean overlap = studentLeaves.findAll().stream().anyMatch(l -> l.getStudentId().equals(s.getId())
                && ("PENDING".equals(l.getStatus()) || "APPROVED".equals(l.getStatus()))
                && !(l.getToDate().compareTo(from) < 0 || l.getFromDate().compareTo(to) > 0));
        if (overlap) throw Teaching.rule("OVERLAP", "There is already a leave request for these dates.");
        StudentLeave l = StudentLeave.builder().id("LV-" + t.school() + "-" + UUID.randomUUID().toString().substring(0, 8)).studentId(s.getId())
                .classId(s.getClassId()).fromDate(from).toDate(to).kind(kind).reason(r.length() > 500 ? r.substring(0, 500) : r)
                .requestedByGuardianId(p.account().getId()).requestedAt(Teaching.now()).status("PENDING").build();
        return studentView(studentLeaves.save(l));
    }

    @Transactional
    public Map<String, Object> withdraw(SchoolPrincipal p, String id) {
        Student s = sessionChild(p);
        StudentLeave l = studentLeaves.findById(id == null ? "" : id).filter(x -> x.getStudentId().equals(s.getId()))
                .orElseThrow(() -> Teaching.denied("Leave request not found."));
        if (!"PENDING".equals(l.getStatus())) throw Teaching.rule("STATE", "Only a pending request can be withdrawn.");
        l.setStatus("WITHDRAWN");
        return studentView(studentLeaves.save(l));
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> listForClass(SchoolPrincipal p, String classId) {
        SchoolClass c = t.classOrThrow(classId);
        if (!Teaching.isClassTeacher(p, c) && p.role() != UserRole.PRINCIPAL) throw Teaching.denied("Only the Class Teacher can review leave for this class.");
        return studentLeaves.findAll().stream().filter(l -> l.getClassId().equals(classId) && !"WITHDRAWN".equals(l.getStatus()))
                .sorted(Comparator.comparing((StudentLeave l) -> !"PENDING".equals(l.getStatus())).thenComparing(StudentLeave::getRequestedAt, Comparator.reverseOrder()))
                .map(l -> {
                    Map<String, Object> m = studentView(l);
                    t.students().findById(l.getStudentId()).ifPresent(st -> {
                        m.put("studentName", st.getName());
                        m.put("rollNumber", st.getRoll());
                    });
                    return m;
                }).toList();
    }

    @Transactional
    public Map<String, Object> decideStudentLeave(SchoolPrincipal p, String id, String decision, String note) {
        StudentLeave l = studentLeaves.findById(id == null ? "" : id).orElseThrow(() -> Teaching.denied("Leave request not found."));
        if (!Teaching.isClassTeacher(p, t.classOrThrow(l.getClassId()))) throw Teaching.denied("Only the Class Teacher decides leave.");
        if (!"PENDING".equals(l.getStatus())) throw Teaching.rule("STATE", "This request was already decided.");
        if (!"APPROVED".equals(decision) && !"REJECTED".equals(decision)) throw Teaching.rule("BAD_DECISION", "Approve or reject.");
        String n = note == null ? "" : note.trim();
        if ("REJECTED".equals(decision) && n.length() < 5) throw Teaching.rule("REASON", "Give the parent a short reason for rejecting.");
        l.setStatus(decision);
        l.setDecidedBy(p.account().getId());
        l.setDecidedByName(p.account().getName());
        l.setDecidedAt(Teaching.now());
        l.setDecisionNote(n.isEmpty() ? null : n);
        studentLeaves.save(l);
        t.record(p, "LEAVE_" + decision, l.getStudentId(), l.getFromDate() + " to " + l.getToDate(), null);
        return studentView(l);
    }

    /** Approved leave covering a date: register context only. */
    public Optional<StudentLeave> approvedLeaveOn(String studentId, String date) {
        return studentLeaves.findAll().stream().filter(l -> l.getStudentId().equals(studentId) && "APPROVED".equals(l.getStatus())
                && l.getFromDate().compareTo(date) <= 0 && l.getToDate().compareTo(date) >= 0).findFirst();
    }

    // ================================================================== timetable

    static int dayNumber(String dayOfWeek) {
        for (int i = 0; i < DAYS.length; i++) if (DAYS[i].name().equals(dayOfWeek)) return i + 1;
        return 0;
    }

    private static Map<String, Object> slotView(TimetableSlot s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("day", dayNumber(s.getDayOfWeek()));
        m.put("period", s.getPeriodNumber());
        m.put("start", s.getStartTime());
        m.put("end", s.getEndTime());
        m.put("subject", s.getSubject());
        m.put("teacherName", s.getTeacherName());
        return m;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> childTimetable(SchoolPrincipal p) {
        String id = p.sessionStudentId();
        Student s = t.students().findById(id == null ? "" : id).orElseThrow(() -> Teaching.denied("Choose a child first."));
        return timetable.findByClassIdOrderByDayOfWeekAscPeriodNumberAsc(s.getClassId()).stream()
                .sorted(Comparator.comparingInt((TimetableSlot x) -> dayNumber(x.getDayOfWeek())).thenComparing(TimetableSlot::getPeriodNumber))
                .map(LeaveService::slotView).toList();
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> myPeriods(SchoolPrincipal p, int day) {
        if (day < 1 || day > 6) return List.of();
        return timetable.findByTeacherIdOrderByDayOfWeekAscPeriodNumberAsc(p.account().getId()).stream()
                .filter(s -> dayNumber(s.getDayOfWeek()) == day)
                .sorted(Comparator.comparing(TimetableSlot::getStartTime))
                .map(s -> {
                    Map<String, Object> m = slotView(s);
                    SchoolClass c = t.classes().findById(s.getClassId()).orElse(null);
                    m.put("classLabel", c == null ? s.getClassId() : c.getGradeNumber() + "-" + c.getSection());
                    return m;
                }).toList();
    }

    // ================================================================== teacher leave

    public Map<String, Object> teacherView(TeacherLeaveRequest l) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", l.getId());
        m.put("schoolId", l.getSchoolId());
        m.put("staffId", l.getStaffId());
        m.put("staffName", l.getStaffName());
        m.put("fromDate", l.getFromDate());
        m.put("toDate", l.getToDate());
        m.put("kind", l.getKind());
        m.put("reason", l.getReason());
        m.put("status", l.getStatus());
        if (l.getDecidedBy() != null) {
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("by", l.getDecidedBy());
            d.put("at", l.getDecidedAt());
            if (l.getDecisionNote() != null) d.put("note", l.getDecisionNote());
            m.put("decision", d);
        }
        List<Map<String, Object>> slots = t.read(l.getSubstitutionJson(), LIST);
        if (l.getArrangedBy() != null) {
            m.put("substitution", Map.of("arrangedBy", l.getArrangedBy(), "note", slots.size() + " of " + needsFor(l, today().toString()).size() + " period(s) covered",
                    "slots", slots));
        }
        return m;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> myLeaves(SchoolPrincipal p) {
        if (p.role() != UserRole.TEACHER) throw Teaching.denied("Only teachers apply for staff leave here.");
        List<Map<String, Object>> out = new ArrayList<>(teacherLeaves.findAll().stream().filter(l -> l.getStaffId().equals(p.account().getId())).map(this::teacherView).toList());
        Collections.reverse(out);
        return out;
    }

    @Transactional
    public Map<String, Object> applyTeacherLeave(SchoolPrincipal p, String from, String to, String kind, String reason) {
        if (p.role() != UserRole.TEACHER) throw Teaching.denied("Only teachers apply for staff leave here.");
        LocalDate f = date(from, "dates"), e = date(to, "dates");
        if (e.isBefore(f)) throw Teaching.rule("DATES", "Check the dates.");
        if (f.isBefore(today().minusDays(3))) throw Teaching.rule("DATES", "Leave can be applied up to 3 days after.");
        if (kind == null || !TEACHER_KINDS.contains(kind)) throw Teaching.rule("KIND", "Choose the type of leave.");
        String r = reason == null ? "" : reason.trim();
        if (r.length() < 5) throw Teaching.rule("REASON", "Add a short reason.");
        boolean overlap = teacherLeaves.findAll().stream().anyMatch(l -> l.getStaffId().equals(p.account().getId())
                && ("PENDING".equals(l.getStatus()) || "APPROVED".equals(l.getStatus()))
                && !(l.getToDate().compareTo(from) < 0 || l.getFromDate().compareTo(to) > 0));
        if (overlap) throw Teaching.rule("OVERLAP", "You already have leave for these dates.");
        TeacherLeaveRequest l = TeacherLeaveRequest.builder().id("TL-" + t.school() + "-" + UUID.randomUUID().toString().substring(0, 8))
                .staffId(p.account().getId()).staffName(p.account().getName()).fromDate(from).toDate(to).kind(kind)
                .reason(r.length() > 500 ? r.substring(0, 500) : r).status("PENDING").substitutionJson("[]").build();
        return teacherView(teacherLeaves.save(l));
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> listTeacherLeave(SchoolPrincipal p) {
        if (!Teaching.isLeadership(p)) throw Teaching.denied("Only the Principal or Admin sees staff leave.");
        return teacherLeaves.findAll().stream()
                .sorted(Comparator.comparing((TeacherLeaveRequest l) -> !"PENDING".equals(l.getStatus())).thenComparing(TeacherLeaveRequest::getFromDate))
                .map(this::teacherView).toList();
    }

    @Transactional
    public Map<String, Object> decideTeacherLeave(SchoolPrincipal p, String id, String decision, String note) {
        if (p.role() != UserRole.PRINCIPAL) throw Teaching.denied("Only the Principal approves teacher leave.");
        TeacherLeaveRequest l = teacherLeaves.findById(id == null ? "" : id).orElseThrow(() -> Teaching.denied("Leave not found."));
        if (!"PENDING".equals(l.getStatus())) throw Teaching.rule("STATE", "Already decided.");
        if (!"APPROVED".equals(decision) && !"REJECTED".equals(decision)) throw Teaching.rule("BAD_DECISION", "Approve or reject.");
        String n = note == null ? "" : note.trim();
        if ("REJECTED".equals(decision) && n.length() < 5) throw Teaching.rule("REASON", "Add a reason.");
        l.setStatus(decision);
        l.setDecidedBy(p.account().getId());
        l.setDecidedAt(Teaching.now());
        l.setDecisionNote(n.isEmpty() ? null : n);
        teacherLeaves.save(l);
        t.record(p, "TEACHER_LEAVE_" + decision, l.getStaffId(), l.getFromDate() + " to " + l.getToDate(), null);
        return teacherView(l);
    }

    // ================================================================== substitution

    /** Everyone who teaches in this school (class teachers + subject teachers). */
    private Map<String, String> staff() {
        Map<String, String> m = new TreeMap<>();
        t.classes().findAll().forEach(c -> {
            if (c.getClassTeacherId() != null) m.put(c.getClassTeacherId(), c.getClassTeacherName());
        });
        subjectTeachers.findAll().forEach(s -> m.put(s.getStaffId(), s.getStaffName()));
        return m;
    }

    private boolean onLeave(String staffId, String date) {
        return teacherLeaves.findAll().stream().anyMatch(l -> l.getStaffId().equals(staffId) && "APPROVED".equals(l.getStatus())
                && l.getFromDate().compareTo(date) <= 0 && l.getToDate().compareTo(date) >= 0);
    }

    private List<Map<String, Object>> allSlots() {
        return teacherLeaves.findAll().stream().flatMap(l -> t.read(l.getSubstitutionJson(), LIST).stream()).toList();
    }

    /** Free = not teaching that period, not on leave, not already substituting elsewhere then. */
    private boolean isFree(String staffId, String date, int period, String classId) {
        if (onLeave(staffId, date)) return false;
        int day = LocalDate.parse(date).getDayOfWeek().getValue();
        boolean teaching = timetable.findByTeacherIdOrderByDayOfWeekAscPeriodNumberAsc(staffId).stream()
                .anyMatch(s -> dayNumber(s.getDayOfWeek()) == day && s.getPeriodNumber() == period);
        if (teaching) return false;
        return allSlots().stream().noneMatch(s -> date.equals(s.get("date")) && Integer.valueOf(period).equals(s.get("period"))
                && staffId.equals(s.get("substituteStaffId")) && !classId.equals(s.get("classSectionId")));
    }

    private List<Map<String, Object>> needsFor(TeacherLeaveRequest l, String today) {
        List<Map<String, Object>> out = new ArrayList<>();
        Map<String, String> staff = staff();
        List<Map<String, Object>> slots = t.read(l.getSubstitutionJson(), LIST);
        LocalDate from = LocalDate.parse(l.getFromDate().compareTo(today) < 0 ? today : l.getFromDate());
        LocalDate to = LocalDate.parse(l.getToDate());
        for (LocalDate d = from; !d.isAfter(to) && out.size() < 500; d = d.plusDays(1)) {
            if (d.getDayOfWeek() == DayOfWeek.SUNDAY) continue;
            String date = d.toString();
            int day = d.getDayOfWeek().getValue();
            for (TimetableSlot s : timetable.findByTeacherIdOrderByDayOfWeekAscPeriodNumberAsc(l.getStaffId())) {
                if (dayNumber(s.getDayOfWeek()) != day) continue;
                SchoolClass c = t.classes().findById(s.getClassId()).orElse(null);
                if (c == null) continue;
                Map<String, Object> n = new LinkedHashMap<>();
                n.put("leaveId", l.getId());
                n.put("absentStaffId", l.getStaffId());
                n.put("absentName", l.getStaffName());
                n.put("date", date);
                n.put("classSectionId", c.getId());
                n.put("classLabel", c.getGradeNumber() + "-" + c.getSection());
                n.put("period", s.getPeriodNumber());
                n.put("start", s.getStartTime());
                n.put("end", s.getEndTime());
                n.put("subject", s.getSubject());
                slots.stream().filter(x -> date.equals(x.get("date")) && c.getId().equals(x.get("classSectionId")) && s.getPeriodNumber().equals(x.get("period")))
                        .findFirst().ifPresent(x -> n.put("assigned", x));
                n.put("freeTeachers", staff.entrySet().stream().filter(e -> !e.getKey().equals(l.getStaffId()) && isFree(e.getKey(), date, s.getPeriodNumber(), c.getId()))
                        .map(e -> Map.of("staffId", e.getKey(), "name", e.getValue())).toList());
                out.add(n);
            }
        }
        return out;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> substitutionNeeds(SchoolPrincipal p) {
        GovernanceService.requirePermission(p, "ACADEMIC_OPS");
        String today = today().toString();
        return teacherLeaves.findAll().stream().filter(l -> "APPROVED".equals(l.getStatus()) && l.getToDate().compareTo(today) >= 0)
                .flatMap(l -> needsFor(l, today).stream())
                .sorted(Comparator.comparing((Map<String, Object> m) -> m.get("date").toString()).thenComparing(m -> (Integer) m.get("period")))
                .toList();
    }

    @Transactional
    public Map<String, Object> assign(SchoolPrincipal p, String leaveId, String date, String classId, int period, String substituteStaffId) {
        GovernanceService.requirePermission(p, "ACADEMIC_OPS");
        TeacherLeaveRequest l = teacherLeaves.findById(leaveId == null ? "" : leaveId).orElseThrow(() -> Teaching.denied("Leave not found."));
        if (!"APPROVED".equals(l.getStatus())) throw Teaching.rule("STATE", "Substitutes are arranged only for leave the Principal approved.");
        Map<String, Object> need = needsFor(l, today().toString()).stream()
                .filter(n -> n.get("date").equals(date) && n.get("classSectionId").equals(classId) && Integer.valueOf(period).equals(n.get("period")))
                .findFirst().orElseThrow(() -> Teaching.rule("NO_PERIOD", "That period is not part of this leave."));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> free = (List<Map<String, Object>>) need.get("freeTeachers");
        Map<String, Object> sub = free.stream().filter(f -> f.get("staffId").equals(substituteStaffId)).findFirst()
                .orElseThrow(() -> Teaching.rule("NOT_FREE", "That teacher is not free in this period."));
        Map<String, Object> slot = new LinkedHashMap<>();
        slot.put("date", date);
        slot.put("classSectionId", classId);
        slot.put("classLabel", need.get("classLabel"));
        slot.put("period", period);
        slot.put("start", need.get("start"));
        slot.put("subject", need.get("subject"));
        slot.put("substituteStaffId", sub.get("staffId"));
        slot.put("substituteName", sub.get("name"));
        slot.put("arrangedAt", Teaching.now());
        List<Map<String, Object>> slots = new ArrayList<>(t.read(l.getSubstitutionJson(), LIST).stream()
                .filter(x -> !(date.equals(x.get("date")) && classId.equals(x.get("classSectionId")) && Integer.valueOf(period).equals(x.get("period")))).toList());
        slots.add(slot);
        l.setSubstitutionJson(t.write(slots));
        l.setArrangedBy(p.account().getId());
        teacherLeaves.save(l);
        t.record(p, need.containsKey("assigned") ? "SUBSTITUTE_REASSIGNED" : "SUBSTITUTE_ASSIGNED", l.getId(),
                date + " P" + period + " " + need.get("classLabel") + " " + need.get("subject") + ": " + sub.get("name") + " for " + l.getStaffName(), null);
        return slot;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> myDuties(SchoolPrincipal p) {
        if (p.role() != UserRole.TEACHER) throw Teaching.denied("Only teachers have substitution duties.");
        String today = today().toString();
        return allSlots().stream().filter(s -> p.account().getId().equals(s.get("substituteStaffId")) && s.get("date").toString().compareTo(today) >= 0)
                .sorted(Comparator.comparing((Map<String, Object> s) -> s.get("date").toString()).thenComparing(s -> (Integer) s.get("period")))
                .toList();
    }
}
