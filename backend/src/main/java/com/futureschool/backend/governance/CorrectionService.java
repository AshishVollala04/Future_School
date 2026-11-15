package com.futureschool.backend.governance;

import com.fasterxml.jackson.core.type.TypeReference;
import com.futureschool.backend.auth.AuthFlowException;
import com.futureschool.backend.auth.SignInService;
import com.futureschool.backend.entity.*;
import com.futureschool.backend.parent.ParentDataService;
import com.futureschool.backend.repository.*;
import com.futureschool.backend.security.SchoolPrincipal;
import com.futureschool.backend.teaching.Teaching;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * Corrections to PUBLISHED results. Never overwritten:
 *   Subject Teacher raises -> Class Teacher verifies (not the person who raised it)
 *   -> Principal approves (fresh OTP) -> Class Teacher republishes
 *   -> new version CURRENT, old version SUPERSEDED.
 */
@Service
public class CorrectionService {

    private static final List<String> OPEN = List.of("RAISED", "VERIFIED", "APPROVED");
    private static final TypeReference<List<Map<String, Object>>> LIST = new TypeReference<>() {
    };

    private final MarkCorrectionRepository corrections;
    private final PublishedResultRepository results;
    private final Teaching t;
    private final SignInService signIn;

    public CorrectionService(MarkCorrectionRepository corrections, PublishedResultRepository results, Teaching t, SignInService signIn) {
        this.corrections = corrections;
        this.results = results;
        this.t = t;
        this.signIn = signIn;
    }

    /** "AB" stays a string; numbers are returned as numbers (the frontend's MarkValue). */
    static Object markValue(String v) {
        if (v == null) return null;
        try {
            return Integer.parseInt(v);
        } catch (NumberFormatException e) {
            return v;
        }
    }

    private boolean teaches(SchoolPrincipal p, String classId, String subject) {
        return p.role() == UserRole.TEACHER && t.view(t.classOrThrow(classId)).subjectTeachers().stream()
                .anyMatch(s -> s.subject().equals(subject) && s.staffId().equals(p.account().getId()));
    }

    private Map<String, Object> view(MarkCorrection c) {
        Student s = t.students().findById(c.getStudentId()).orElse(null);
        SchoolClass cls = t.classes().findById(c.getClassId()).orElse(null);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", c.getId());
        m.put("schoolId", c.getSchoolId());
        m.put("resultId", c.getResultId());
        m.put("studentId", c.getStudentId());
        m.put("classSectionId", c.getClassId());
        m.put("examName", c.getExamName());
        m.put("subject", c.getSubject());
        m.put("field", c.getField());
        m.put("from", markValue(c.getFromValue()));
        m.put("to", markValue(c.getToValue()));
        m.put("reason", c.getReason());
        m.put("raisedBy", c.getRaisedBy());
        m.put("status", c.getStatus());
        m.put("log", t.read(c.getLogJson(), LIST));
        m.put("studentName", s == null ? c.getStudentId() : s.getName());
        m.put("rollNumber", s == null ? "" : s.getRoll());
        String label = cls != null ? (cls.getGradeNumber() + "-" + cls.getSection()) : c.getClassId();
        m.put("classLabel", label);
        return m;
    }

    private void log(MarkCorrection c, SchoolPrincipal p, String action, String note) {
        List<Map<String, Object>> l = t.read(c.getLogJson(), LIST);
        Map<String, Object> e = new LinkedHashMap<>();
        e.put("at", Teaching.now());
        e.put("by", p.account().getId());
        e.put("action", action);
        if (note != null && !note.isBlank()) e.put("note", note);
        l.add(e);
        c.setLogJson(t.write(l));
    }

    private MarkCorrection find(String id) {
        return corrections.findById(id == null ? "" : id).orElseThrow(() -> Teaching.denied("Correction not found."));
    }

    /** Subject Teacher: current published marks for MY subjects, with any open correction. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> listCorrectable(SchoolPrincipal p) {
        if (p.role() != UserRole.TEACHER) throw Teaching.denied("Only teachers raise corrections.");
        List<MarkCorrection> all = corrections.findAll();
        List<Map<String, Object>> out = new ArrayList<>();
        for (SchoolClass cls : t.classes().findAll()) {
            List<String> mine = t.view(cls).subjectTeachers().stream().filter(s -> s.staffId().equals(p.account().getId())).map(Teaching.SubjectTeacher::subject).toList();
            if (mine.isEmpty()) continue;
            for (Student st : t.roster(cls.getId())) {
                for (PublishedResult r : results.findByStudentId(st.getId())) {
                    if (!"CURRENT".equals(r.getStatus())) continue;
                    for (Map<String, Object> sub : t.read(r.getSubjectsJson(), LIST)) {
                        if (!mine.contains(String.valueOf(sub.get("subject")))) continue;
                        String subject = String.valueOf(sub.get("subject"));
                        Optional<MarkCorrection> open = all.stream().filter(c -> c.getResultId().equals(r.getId()) && c.getSubject().equals(subject) && OPEN.contains(c.getStatus())).findFirst();
                        Map<String, Object> row = new LinkedHashMap<>();
                        row.put("resultId", r.getId());
                        row.put("studentId", st.getId());
                        row.put("studentName", st.getName());
                        row.put("rollNumber", st.getRoll());
                        row.put("examName", r.getExamName());
                        row.put("version", r.getVersion());
                        row.put("subject", subject);
                        row.put("internal", sub.get("internal"));
                        row.put("external", sub.get("external"));
                        row.put("maxInternal", sub.get("maxInternal"));
                        row.put("maxExternal", sub.get("maxExternal"));
                        open.ifPresent(c -> row.put("openCorrection", c.getStatus()));
                        out.add(row);
                    }
                }
            }
        }
        out.sort(Comparator.comparing((Map<String, Object> m) -> m.get("examName").toString()).thenComparing(m -> m.get("rollNumber").toString()));
        return out;
    }

    @Transactional
    public Map<String, Object> raise(SchoolPrincipal p, String resultId, String subject, String field, Object to, String reason) {
        if (p.role() != UserRole.TEACHER) throw Teaching.denied("Only teachers raise corrections.");
        PublishedResult r = results.findById(resultId == null ? "" : resultId).orElse(null);
        if (r == null || !"CURRENT".equals(r.getStatus())) throw Teaching.rule("STATE", "Only the current published version can be corrected.");
        Student st = t.students().findById(r.getStudentId()).orElseThrow(() -> Teaching.denied("Student not found."));
        if (!teaches(p, st.getClassId(), subject)) throw Teaching.denied("Only the subject teacher can raise this correction.");
        if (!"internal".equals(field) && !"external".equals(field)) throw Teaching.rule("FIELD", "Choose internal or external.");
        Map<String, Object> sub = t.read(r.getSubjectsJson(), LIST).stream().filter(x -> subject.equals(x.get("subject"))).findFirst()
                .orElseThrow(() -> Teaching.rule("NOT_FOUND", "Subject not on this result."));
        int max = ((Number) sub.get("internal".equals(field) ? "maxInternal" : "maxExternal")).intValue();
        if (max == 0) throw Teaching.rule("FIELD", "This field is not part of the assessment.");
        String toS;
        if ("AB".equals(to)) toS = "AB";
        else if (to instanceof Number n && n.doubleValue() == Math.floor(n.doubleValue()) && n.intValue() >= 0 && n.intValue() <= max) toS = String.valueOf(n.intValue());
        else throw Teaching.rule("INVALID", "Enter 0-" + max + " or AB.");
        String fromS = String.valueOf(sub.get(field));
        if (fromS.equals(toS)) throw Teaching.rule("SAME", "The new value is the same as the published one.");
        String why = reason == null ? "" : reason.trim();
        if (why.length() < 10) throw Teaching.rule("REASON", "Explain the correction (10+ characters).");
        if (corrections.findAll().stream().anyMatch(c -> c.getResultId().equals(r.getId()) && c.getSubject().equals(subject) && OPEN.contains(c.getStatus()))) {
            throw Teaching.rule("OPEN", "A correction for this subject is already in progress.");
        }
        MarkCorrection c = MarkCorrection.builder().id("MC-" + t.school() + "-" + UUID.randomUUID().toString().substring(0, 8)).resultId(r.getId())
                .studentId(st.getId()).classId(st.getClassId()).examName(r.getExamName()).subject(subject).field(field).fromValue(fromS).toValue(toS)
                .reason(why).raisedBy(p.account().getId()).status("RAISED").logJson("[]").build();
        log(c, p, "RAISED", null);
        return view(corrections.save(c));
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> listForClassTeacher(SchoolPrincipal p, String classId) {
        if (!Teaching.isClassTeacher(p, t.classOrThrow(classId))) throw Teaching.denied("Only the Class Teacher sees these corrections.");
        List<Map<String, Object>> out = new ArrayList<>(corrections.findAll().stream().filter(c -> c.getClassId().equals(classId)).map(this::view).toList());
        Collections.reverse(out);
        return out;
    }

    @Transactional
    public Map<String, Object> verify(SchoolPrincipal p, String id, String decision, String note) {
        MarkCorrection c = find(id);
        if (!Teaching.isClassTeacher(p, t.classOrThrow(c.getClassId()))) throw Teaching.denied("Only the Class Teacher verifies corrections.");
        if (c.getRaisedBy().equals(p.account().getId())) throw Teaching.rule("SAME_PERSON", "You raised this correction; it must be verified by someone else.");
        if (!"RAISED".equals(c.getStatus())) throw Teaching.rule("STATE", "Not waiting for verification.");
        String n = note == null ? "" : note.trim();
        if ("REJECT".equals(decision) && n.length() < 5) throw Teaching.rule("REASON", "Add a note.");
        if (!"VERIFY".equals(decision) && !"REJECT".equals(decision)) throw Teaching.rule("BAD_DECISION", "Verify or reject.");
        c.setStatus("VERIFY".equals(decision) ? "VERIFIED" : "REJECTED");
        log(c, p, c.getStatus(), n);
        return view(corrections.save(c));
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> listForPrincipal(SchoolPrincipal p) {
        if (p.role() != UserRole.PRINCIPAL) throw Teaching.denied("Only the Principal approves corrections.");
        return corrections.findAll().stream().filter(c -> !"RAISED".equals(c.getStatus()))
                .sorted(Comparator.comparing((MarkCorrection c) -> !"VERIFIED".equals(c.getStatus()))).map(this::view).toList();
    }

    @Transactional(noRollbackFor = AuthFlowException.class)
    public Map<String, Object> principalDecide(SchoolPrincipal p, String id, String decision, String note, String stepUpToken) {
        if (p.role() != UserRole.PRINCIPAL) throw Teaching.denied("Only the Principal approves corrections.");
        MarkCorrection c = find(id);
        if (!"VERIFIED".equals(c.getStatus())) throw Teaching.rule("STATE", "Not waiting for approval.");
        String n = note == null ? "" : note.trim();
        if ("APPROVE".equals(decision)) {
            if (!signIn.consumeStepUp(stepUpToken, "SENSITIVE_STAFF_ACTION", p.session())) {
                throw new AuthFlowException("STEP_UP_REQUIRED", "Please confirm with the OTP again.", null, 401);
            }
            c.setStatus("APPROVED");
        } else if ("REJECT".equals(decision)) {
            if (n.length() < 5) throw Teaching.rule("REASON", "Add a note.");
            c.setStatus("REJECTED");
        } else {
            throw Teaching.rule("BAD_DECISION", "Approve or reject.");
        }
        log(c, p, c.getStatus(), n);
        corrections.save(c);
        t.record(p, "MARK_CORRECTION_" + c.getStatus(), c.getStudentId(), c.getExamName() + " " + c.getSubject() + ": " + c.getFromValue() + " → " + c.getToValue(), c.getReason());
        return view(c);
    }

    @Transactional
    public Map<String, Object> republish(SchoolPrincipal p, String id) {
        MarkCorrection c = find(id);
        if (!Teaching.isClassTeacher(p, t.classOrThrow(c.getClassId()))) throw Teaching.denied("Only the Class Teacher republishes.");
        if (!"APPROVED".equals(c.getStatus())) throw Teaching.rule("STATE", "The Principal has not approved this correction yet.");
        PublishedResult current = results.findById(c.getResultId()).orElse(null);
        if (current == null || !"CURRENT".equals(current.getStatus())) throw Teaching.rule("STALE", "The result changed since this correction was raised. Raise it again.");
        int version = results.findByStudentId(c.getStudentId()).stream().filter(r -> r.getExamName().equals(c.getExamName()))
                .mapToInt(PublishedResult::getVersion).max().orElse(0) + 1;
        List<Map<String, Object>> subjects = t.read(current.getSubjectsJson(), LIST);
        subjects.forEach(s -> {
            if (c.getSubject().equals(s.get("subject"))) s.put(c.getField(), markValue(c.getToValue()));
        });
        PublishedResult next = PublishedResult.builder().id(current.getId().replaceAll("-v\\d+$", "") + "-v" + version).studentId(current.getStudentId())
                .examName(current.getExamName()).version(version).status("CURRENT").publishedOn(ParentDataService.today())
                .subjectsJson(t.write(subjects)).classTeacherRemark(current.getClassTeacherRemark()).build();
        current.setStatus("SUPERSEDED");
        results.save(current);
        results.save(next);
        c.setStatus("REPUBLISHED");
        log(c, p, "REPUBLISHED", "v" + version);
        corrections.save(c);
        t.record(p, "RESULT_REPUBLISHED", c.getStudentId(), c.getExamName() + " v" + current.getVersion() + " superseded by v" + version
                + " (" + c.getSubject() + " " + c.getFromValue() + " → " + c.getToValue() + ").", null);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", next.getId());
        m.put("studentId", next.getStudentId());
        m.put("examName", next.getExamName());
        m.put("version", next.getVersion());
        m.put("status", next.getStatus());
        m.put("publishedOn", next.getPublishedOn());
        m.put("subjects", subjects);
        m.put("classTeacherRemark", next.getClassTeacherRemark());
        return m;
    }
}
