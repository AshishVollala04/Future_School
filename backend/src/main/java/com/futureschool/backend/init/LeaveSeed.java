package com.futureschool.backend.init;

import com.futureschool.backend.entity.*;
import com.futureschool.backend.parent.ParentDataService;
import com.futureschool.backend.repository.*;
import com.futureschool.backend.tenant.TenantContext;
import org.springframework.stereotype.Component;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.*;

/**
 * Development seed: timetables (same rotation as the frontend prototype), SJM class structure,
 * and the prototype's leave requests. Call inside TenantContext.runAs(school). Idempotent.
 */
@Component
public class LeaveSeed {

    private static final String[][] PERIOD_TIMES = {{"09:00", "09:45"}, {"09:45", "10:30"}, {"10:45", "11:30"}, {"11:30", "12:15"}, {"13:00", "13:45"}, {"13:45", "14:30"}};
    private static final Map<String, List<String>> SUBJECTS_BY_STAGE = Map.of(
            "primary", List.of("Telugu", "English", "Mathematics", "EVS", "Hindi"),
            "upper", List.of("Telugu", "Hindi", "English", "Mathematics", "Science", "Social Studies"),
            "high", List.of("Telugu", "Hindi", "English", "Mathematics", "Physical Science", "Biology", "Social Studies"));
    private static final DayOfWeek[] DAYS = {DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY};

    private final SchoolClassRepository classes;
    private final ClassSubjectTeacherRepository subjectTeachers;
    private final TimetableSlotRepository timetable;
    private final StudentLeaveRepository studentLeaves;
    private final TeacherLeaveRequestRepository teacherLeaves;

    public LeaveSeed(SchoolClassRepository classes, ClassSubjectTeacherRepository subjectTeachers, TimetableSlotRepository timetable,
                     StudentLeaveRepository studentLeaves, TeacherLeaveRequestRepository teacherLeaves) {
        this.classes = classes;
        this.subjectTeachers = subjectTeachers;
        this.timetable = timetable;
        this.studentLeaves = studentLeaves;
        this.teacherLeaves = teacherLeaves;
    }

    private static String stage(int grade) {
        return grade <= 5 ? "primary" : grade <= 8 ? "upper" : "high";
    }

    private void timetables() {
        if (timetable.count() > 0) return;
        for (SchoolClass c : classes.findAll()) {
            int grade = c.getGradeNumber() == null ? 0 : c.getGradeNumber();
            List<String> subjects = SUBJECTS_BY_STAGE.get(stage(grade));
            Map<String, ClassSubjectTeacher> bySubject = new HashMap<>();
            subjectTeachers.findByClassIdOrderByIdAsc(c.getId()).forEach(s -> bySubject.putIfAbsent(s.getSubject(), s));
            for (int day = 1; day <= 6; day++) {
                int periods = day == 6 ? 4 : 6;
                for (int p = 0; p < periods; p++) {
                    String subject = subjects.get((day * 2 + p) % subjects.size());
                    ClassSubjectTeacher st = bySubject.get(subject);
                    timetable.save(TimetableSlot.builder().id(c.getId() + "-" + DAYS[day - 1] + "-" + (p + 1)).classId(c.getId())
                            .dayOfWeek(DAYS[day - 1].name()).periodNumber(p + 1).startTime(PERIOD_TIMES[p][0]).endTime(PERIOD_TIMES[p][1])
                            .subject(subject).teacherId(st != null ? st.getStaffId() : c.getClassTeacherId())
                            .teacherName(st != null ? st.getStaffName() : c.getClassTeacherName()).build());
                }
            }
        }
    }

    /** n-th school day (Mon-Sat) after today. */
    private static String nextSchoolDay(int n) {
        LocalDate d = LocalDate.now(ParentDataService.SCHOOL_ZONE);
        while (n > 0) {
            d = d.plusDays(1);
            if (d.getDayOfWeek() != DayOfWeek.SUNDAY) n--;
        }
        return d.toString();
    }

    private static String days(int n) {
        return LocalDate.now(ParentDataService.SCHOOL_ZONE).plusDays(n).toString();
    }

    public void seedGvs() {
        timetables();
        if (studentLeaves.count() > 0) return;
        String sid = TenantContext.require();
        studentLeaves.save(StudentLeave.builder().id("LV-" + sid + "-1").studentId("GVS-2027-0001").classId("GVS-10-A").fromDate(days(1)).toDate(days(1))
                .kind("MEDICAL_APPOINTMENT").reason("Eye check-up at the hospital in the morning.").requestedByGuardianId("GRD-0001")
                .requestedAt(days(-1) + "T20:10:00+05:30").status("PENDING").build());
        studentLeaves.save(StudentLeave.builder().id("LV-" + sid + "-2").studentId("GVS-2027-0006").classId("GVS-10-A").fromDate(days(0)).toDate(days(1))
                .kind("FAMILY").reason("Family function out of town.").requestedByGuardianId("GRD-9006").requestedAt(days(-3) + "T18:00:00+05:30")
                .status("APPROVED").decidedBy("STF-T-0001").decidedByName("Sarah Jenkins").decidedAt(days(-2) + "T09:00:00+05:30").decisionNote("Approved.").build());
        teacherLeaves.save(TeacherLeaveRequest.builder().id("TL-" + sid + "-1").staffId("STF-T-0002").staffName("Raghavan Nair").fromDate(days(8)).toDate(days(9))
                .kind("TRAINING").reason("SCERT mathematics teacher training at Hyderabad.").status("PENDING").substitutionJson("[]").build());
        // Approved: the Admin still has to arrange substitutes (Flow 6).
        teacherLeaves.save(TeacherLeaveRequest.builder().id("TL-" + sid + "-2").staffId("STF-T-0003").staffName("K. Lakshmi")
                .fromDate(nextSchoolDay(1)).toDate(nextSchoolDay(1)).kind("SICK").reason("Medical appointment.").status("APPROVED")
                .decidedBy("ACC-L-0001").decidedAt(days(-1) + "T16:00:00+05:30").substitutionJson("[]").build());
    }

    public void seedSjm() {
        if (subjectTeachers.findByClassIdOrderByIdAsc("SJM-4-B").isEmpty()) {
            classes.findById("SJM-4-B").ifPresent(c -> {
                c.setClassTeacherId("STF-T-0101");
                c.setClassTeacherName("J. Mary");
                classes.save(c);
            });
            String[][] st = {{"Telugu", "STF-T-0102", "G. Swapna"}, {"English", "STF-T-0101", "J. Mary"}, {"Mathematics", "STF-T-0101", "J. Mary"},
                    {"EVS", "STF-T-0103", "D. Prakash"}, {"Hindi", "STF-T-0104", "N. Rekha"}};
            int i = 0;
            for (String[] s : st) {
                subjectTeachers.save(ClassSubjectTeacher.builder().id("SJM-4-B-" + (++i) + "-" + s[0]).classId("SJM-4-B").subject(s[0])
                        .staffId(s[1]).staffName(s[2]).build());
            }
        }
        timetables();
    }
}
