package com.futureschool.backend.teaching;

import com.fasterxml.jackson.core.type.TypeReference;
import com.futureschool.backend.entity.AttendanceRegister;
import com.futureschool.backend.entity.SchoolClass;
import com.futureschool.backend.entity.Student;
import com.futureschool.backend.entity.StudentAttendanceDay;
import com.futureschool.backend.parent.ParentDataService;
import com.futureschool.backend.repository.AttendanceRegisterRepository;
import com.futureschool.backend.repository.StudentAttendanceDayRepository;
import com.futureschool.backend.security.SchoolPrincipal;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.*;

/**
 * Class Teacher attendance register.
 *  - Only the Class Teacher of the class records it (morning / afternoon).
 *  - Every active student must be marked. No future dates, no Sundays.
 *  - Saving again with changes is a CORRECTION: needs a reason, appended to history, audited.
 *  - The parent app reads the result immediately (LATE counts as present).
 */
@Service
public class RegisterService {

    private static final Set<String> MARKS = Set.of("P", "A", "L", "LATE");
    private static final Set<String> SESSIONS = Set.of("MORNING", "AFTERNOON");

    /** leave = approved leave covering the date: context only, never applied automatically. */
    public record Row(String studentId, String name, String rollNumber, String mark,
                      @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL) Map<String, Object> leave) {
    }

    public record Saved(String savedAt, String savedBy, List<Map<String, Object>> history) {
    }

    public record RegisterView(String classSectionId, String date, String session, Saved saved, List<Row> rows) {
    }

    private final Teaching t;
    private final AttendanceRegisterRepository registers;
    private final StudentAttendanceDayRepository days;
    private final com.futureschool.backend.repository.StudentLeaveRepository leaves;
    private final com.futureschool.backend.alerts.AlertService alerts;

    public RegisterService(Teaching t, AttendanceRegisterRepository registers, StudentAttendanceDayRepository days,
                           com.futureschool.backend.repository.StudentLeaveRepository leaves,
                           com.futureschool.backend.alerts.AlertService alerts) {
        this.leaves = leaves;
        this.alerts = alerts;
        this.t = t;
        this.registers = registers;
        this.days = days;
    }

    private SchoolClass assertClassTeacher(SchoolPrincipal p, String classId) {
        SchoolClass c = t.classOrThrow(classId);
        if (!Teaching.isClassTeacher(p, c)) throw Teaching.denied("Only the Class Teacher records attendance for this class.");
        return c;
    }

    private static String id(String c, String d, String s) {
        return c + ":" + d + ":" + s;
    }

    @Transactional(readOnly = true)
    public RegisterView get(SchoolPrincipal p, String classId, String date, String session) {
        assertClassTeacher(p, classId);
        return view(classId, date, session);
    }

    private RegisterView view(String classId, String date, String session) {
        AttendanceRegister reg = registers.findById(id(classId, date, session)).orElse(null);
        Map<String, String> marks = reg == null ? Map.of() : t.read(reg.getMarksJson(), new TypeReference<Map<String, String>>() {
        });
        List<com.futureschool.backend.entity.StudentLeave> approved = leaves.findAll().stream()
                .filter(l -> "APPROVED".equals(l.getStatus()) && l.getFromDate().compareTo(date) <= 0 && l.getToDate().compareTo(date) >= 0).toList();
        List<Row> rows = t.roster(classId).stream().map(s -> new Row(s.getId(), s.getName(), s.getRoll(), marks.get(s.getId()),
                approved.stream().filter(l -> l.getStudentId().equals(s.getId())).findFirst()
                        .map(l -> Map.<String, Object>of("id", l.getId(), "kind", l.getKind(), "fromDate", l.getFromDate(), "toDate", l.getToDate())).orElse(null))).toList();
        Saved saved = reg == null ? null : new Saved(reg.getSavedAt(), reg.getSavedBy(), t.read(reg.getHistoryJson(), new TypeReference<List<Map<String, Object>>>() {
        }));
        return new RegisterView(classId, date, session, saved, rows);
    }

    @Transactional
    public RegisterView save(SchoolPrincipal p, String classId, String date, String session, Map<String, String> input, String correctionReason) {
        assertClassTeacher(p, classId);
        if (session == null || !SESSIONS.contains(session)) throw Teaching.rule("BAD_SESSION", "Choose morning or afternoon.");
        LocalDate d;
        try {
            d = LocalDate.parse(date);
        } catch (Exception e) {
            throw Teaching.rule("BAD_DATE", "Choose a valid date.");
        }
        if (d.isAfter(LocalDate.now(ParentDataService.SCHOOL_ZONE))) throw Teaching.rule("FUTURE", "Attendance cannot be recorded for a future date.");
        if (d.getDayOfWeek() == DayOfWeek.SUNDAY) throw Teaching.rule("HOLIDAY", "Sunday is not a working day.");
        List<Student> roster = t.roster(classId);
        Map<String, String> in = input == null ? Map.of() : input;
        long missing = roster.stream().filter(s -> in.get(s.getId()) == null || !MARKS.contains(in.get(s.getId()))).count();
        if (missing > 0) throw Teaching.rule("INCOMPLETE", "Mark every student first (" + missing + " left).");
        Map<String, String> marks = new LinkedHashMap<>();
        roster.forEach(s -> marks.put(s.getId(), in.get(s.getId()))); // ids outside the class are ignored

        String rid = id(classId, date, session);
        AttendanceRegister existing = registers.findById(rid).orElse(null);
        String now = Teaching.now();
        if (existing == null) {
            registers.save(AttendanceRegister.builder().id(rid).classId(classId).date(date).session(session).marksJson(t.write(marks))
                    .savedBy(p.account().getId()).savedAt(now).historyJson("[]").build());
        } else {
            Map<String, String> old = t.read(existing.getMarksJson(), new TypeReference<Map<String, String>>() {
            });
            List<Map<String, Object>> changes = new ArrayList<>();
            roster.forEach(s -> {
                if (!Objects.equals(old.get(s.getId()), marks.get(s.getId()))) {
                    Map<String, Object> ch = new LinkedHashMap<>();
                    ch.put("studentId", s.getId());
                    ch.put("from", old.get(s.getId()));
                    ch.put("to", marks.get(s.getId()));
                    changes.add(ch);
                }
            });
            if (changes.isEmpty()) return view(classId, date, session);
            String reason = correctionReason == null ? "" : correctionReason.trim();
            if (reason.length() < 5) throw Teaching.rule("REASON_REQUIRED", "This register was already saved. Give a reason for the correction.");
            List<Map<String, Object>> history = t.read(existing.getHistoryJson(), new TypeReference<List<Map<String, Object>>>() {
            });
            Map<String, Object> h = new LinkedHashMap<>();
            h.put("at", now);
            h.put("by", p.account().getId());
            h.put("reason", reason);
            h.put("changes", changes);
            history.add(h);
            existing.setMarksJson(t.write(marks));
            existing.setHistoryJson(t.write(history));
            registers.save(existing);
            t.record(p, "ATTENDANCE_CORRECTED", rid, changes.size() + " change(s).", reason);
        }
        // What the parent app shows: LATE counts as present.
        roster.forEach(s -> {
            String m = "LATE".equals(marks.get(s.getId())) ? "P" : marks.get(s.getId());
            String dayId = s.getId() + "-" + date;
            StudentAttendanceDay day = days.findById(dayId).orElseGet(() -> StudentAttendanceDay.builder().id(dayId).studentId(s.getId())
                    .date(date).morning("-").afternoon("-").build());
            if ("MORNING".equals(session)) day.setMorning(m);
            else day.setAfternoon(m);
            days.save(day);
        });
        alerts.afterRegisterSaved(p, roster, date); // WhatsApp absence alerts (held, cancellable)
        return view(classId, date, session);
    }
}
