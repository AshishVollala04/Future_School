package com.futureschool.backend.init;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.futureschool.backend.entity.*;
import com.futureschool.backend.repository.*;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.*;

/**
 * Development seed for the staff side, matching the frontend prototype:
 * class teachers, subject teachers, the full GVS 10-A roster, and FA-2 marks sheets in
 * mixed states (most submitted, Mathematics draft, Physical Science not started).
 * Call inside TenantContext.runAs(GVS) and a transaction. Idempotent.
 */
@Component
public class TeachingSeed {

    record T(String id, String name) {
    }

    static final T JENKINS = new T("STF-T-0001", "Sarah Jenkins"), NAIR = new T("STF-T-0002", "Raghavan Nair"),
            LAKSHMI = new T("STF-T-0003", "K. Lakshmi"), ANJALI = new T("STF-T-0004", "S. Anjali"), RAMESH = new T("STF-T-0005", "P. Ramesh"),
            FARHANA = new T("STF-T-0006", "M. Farhana"), SURESH = new T("STF-T-0007", "V. Suresh"), PADMA = new T("STF-T-0008", "T. Padma"),
            KIRAN = new T("STF-T-0009", "R. Kiran");

    private final SchoolClassRepository classes;
    private final ClassSubjectTeacherRepository subjectTeachers;
    private final StudentRepository students;
    private final AssessmentRepository assessments;
    private final MarksSheetRepository sheets;
    private final ObjectMapper json;

    public TeachingSeed(SchoolClassRepository classes, ClassSubjectTeacherRepository subjectTeachers, StudentRepository students,
                        AssessmentRepository assessments, MarksSheetRepository sheets, ObjectMapper json) {
        this.classes = classes;
        this.subjectTeachers = subjectTeachers;
        this.students = students;
        this.assessments = assessments;
        this.sheets = sheets;
        this.json = json;
    }

    private static List<Object[]> high(T ct) {
        return List.of(new Object[]{"Telugu", LAKSHMI}, new Object[]{"Hindi", ANJALI}, new Object[]{"English", RAMESH},
                new Object[]{"Mathematics", NAIR}, new Object[]{"Physical Science", JENKINS}, new Object[]{"Biology", FARHANA},
                new Object[]{"Social Studies", ct.id().equals(KIRAN.id()) ? KIRAN : SURESH});
    }

    public void seedGvs() {
        if (assessments.count() > 0) return;
        structure("GVS-10-A", JENKINS, high(JENKINS));
        structure("GVS-10-B", NAIR, high(NAIR));
        structure("GVS-9-A", KIRAN, high(KIRAN));
        structure("GVS-6-B", PADMA, List.of(new Object[]{"Telugu", LAKSHMI}, new Object[]{"Hindi", ANJALI}, new Object[]{"English", PADMA},
                new Object[]{"Mathematics", PADMA}, new Object[]{"Science", FARHANA}, new Object[]{"Social Studies", SURESH}));

        // The rest of Class 10-A (Aarav is seeded with the parents).
        String[][] tenA = {{"GVS-2027-0002", "Aadhya Patel", "01"}, {"GVS-2027-0003", "Aditya Nair", "02"}, {"GVS-2027-0004", "Devansh Reddy", "05"},
                {"GVS-2027-0005", "Harini Rao", "09"}, {"GVS-2027-0006", "Mohammed Arif", "14"}};
        for (String[] s : tenA) {
            if (!students.existsById(s[0])) {
                students.save(Student.builder().id(s[0]).admissionNumber(s[0]).name(s[1]).classId("GVS-10-A").className("Class 10")
                        .section("A").roll(s[2]).status("Active").build());
            }
        }

        assessments.save(Assessment.builder().id("AS-GVS-FA2").name("FA-2").academicYear("2026-27").gradesCsv("9,10").maxInternal(20).maxExternal(0)
                .passPercent(35).secondLanguagePassPercent(20).secondLanguageSubjectsCsv("Hindi").status("OPEN").build());
        sheet("Telugu", LAKSHMI, "SUBMITTED", "ALL", null);
        sheet("Hindi", ANJALI, "SUBMITTED", "ALL", null);
        sheet("English", RAMESH, "SUBMITTED", "ALL", null);
        sheet("Mathematics", NAIR, "DRAFT", "SOME", null);
        sheet("Physical Science", JENKINS, "NOT_STARTED", "NONE", null);
        sheet("Biology", FARHANA, "SUBMITTED", "ALL", "GVS-2027-0004");
        sheet("Social Studies", SURESH, "SUBMITTED", "ALL", null);
    }

    private void structure(String classId, T ct, List<Object[]> subjects) {
        classes.findById(classId).ifPresent(c -> {
            c.setClassTeacherId(ct.id());
            c.setClassTeacherName(ct.name());
            classes.save(c);
        });
        int i = 0;
        for (Object[] s : subjects) {
            T t = (T) s[1];
            String id = classId + "-" + (++i) + "-" + s[0].toString().replace(' ', '_');
            if (!subjectTeachers.existsById(id)) {
                subjectTeachers.save(ClassSubjectTeacher.builder().id(id).classId(classId).subject((String) s[0]).staffId(t.id()).staffName(t.name()).build());
            }
        }
    }

    /** Same deterministic score as the frontend seed: 9..20. */
    static int score(String sid, String subj) {
        int h = 7;
        for (char ch : (sid + subj).toCharArray()) h = (h * 33 + ch) % 9973;
        return 9 + (h % 12);
    }

    private void sheet(String subject, T teacher, String status, String fill, String absent) {
        List<Student> roster = students.findByClassIdAndStatusOrderByRollAsc("GVS-10-A", "Active");
        // Frontend order: seed order (Aarav first), so "SOME" = first three by seed order.
        List<String> order = List.of("GVS-2027-0001", "GVS-2027-0002", "GVS-2027-0003", "GVS-2027-0004", "GVS-2027-0005", "GVS-2027-0006");
        Map<String, Map<String, Object>> rows = new LinkedHashMap<>();
        for (Student st : roster) {
            int i = order.indexOf(st.getId());
            boolean filled = "ALL".equals(fill) || ("SOME".equals(fill) && i >= 0 && i < 3);
            Map<String, Object> r = new HashMap<>();
            r.put("internal", !filled ? null : st.getId().equals(absent) ? "AB" : score(st.getId(), subject));
            r.put("external", null);
            rows.put(st.getId(), r);
        }
        List<Map<String, Object>> log = new ArrayList<>();
        if ("SUBMITTED".equals(status)) {
            log.add(Map.of("at", LocalDate.now().minusDays(2) + "T16:00:00+05:30", "by", teacher.id(), "action", "SUBMITTED"));
        }
        try {
            sheets.save(MarksSheet.builder().id("AS-GVS-FA2:GVS-10-A:" + subject).assessmentId("AS-GVS-FA2").classId("GVS-10-A").subject(subject)
                    .teacherStaffId(teacher.id()).status(status).rowsJson(json.writeValueAsString(rows)).logJson(json.writeValueAsString(log)).build());
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
