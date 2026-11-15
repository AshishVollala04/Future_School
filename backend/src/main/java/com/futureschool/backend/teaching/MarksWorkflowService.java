package com.futureschool.backend.teaching;

import com.fasterxml.jackson.core.type.TypeReference;
import com.futureschool.backend.entity.*;
import com.futureschool.backend.parent.ParentDataService;
import com.futureschool.backend.repository.*;
import com.futureschool.backend.security.SchoolPrincipal;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * Marks entry -> Class Teacher review -> report cards -> Principal -> Class Teacher publishes.
 *
 *  - A Subject Teacher enters marks ONLY for their assigned class + subject in an OPEN assessment.
 *  - Absence is "AB", never 0. Values are whole numbers within the max.
 *  - Sheet: NOT_STARTED -> DRAFT -> SUBMITTED -> (RETURNED -> SUBMITTED)* -> ACCEPTED.
 *  - Class Teacher accepts/returns each subject; generates report cards only when all are ACCEPTED.
 *  - Principal approves or returns EACH card. The Principal never publishes.
 *  - Class Teacher publishes only when ALL cards of the class are APPROVED. Publishing creates a
 *    new result VERSION; earlier versions become SUPERSEDED (never overwritten).
 *  - Parents see nothing until publication.
 */
@Service
public class MarksWorkflowService {

    private static final TypeReference<Map<String, Map<String, Object>>> ROWS = new TypeReference<>() {
    };
    private static final TypeReference<List<Map<String, Object>>> LIST = new TypeReference<>() {
    };
    private static final Map<String, Integer> SHEET_ORDER = Map.of("RETURNED", 0, "DRAFT", 1, "NOT_STARTED", 2, "SUBMITTED", 3, "ACCEPTED", 4);

    private final Teaching t;
    private final AssessmentRepository assessments;
    private final MarksSheetRepository sheets;
    private final ReportCardRepository cards;
    private final PublishedResultRepository results;
    private final SchoolClassRepository classes;

    public MarksWorkflowService(Teaching t, AssessmentRepository assessments, MarksSheetRepository sheets, ReportCardRepository cards,
                                PublishedResultRepository results, SchoolClassRepository classes) {
        this.t = t;
        this.assessments = assessments;
        this.sheets = sheets;
        this.cards = cards;
        this.results = results;
        this.classes = classes;
    }

    // ------------------------------------------------------------------ views

    private static List<Integer> grades(Assessment a) {
        return Arrays.stream(a.getGradesCsv().split(",")).map(String::trim).map(Integer::parseInt).toList();
    }

    private static List<String> secondLanguages(Assessment a) {
        return a.getSecondLanguageSubjectsCsv().isBlank() ? List.of() : Arrays.stream(a.getSecondLanguageSubjectsCsv().split(",")).map(String::trim).toList();
    }

    public Map<String, Object> assessmentView(Assessment a) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", a.getId());
        m.put("schoolId", a.getSchoolId());
        m.put("name", a.getName());
        m.put("academicYear", a.getAcademicYear());
        m.put("grades", grades(a));
        m.put("maxInternal", a.getMaxInternal());
        m.put("maxExternal", a.getMaxExternal());
        m.put("passPercent", a.getPassPercent());
        m.put("secondLanguagePassPercent", a.getSecondLanguagePassPercent());
        m.put("secondLanguageSubjects", secondLanguages(a));
        m.put("status", a.getStatus());
        return m;
    }

    private Assessment assessmentOrThrow(String id) {
        return assessments.findById(id == null ? "" : id).orElseThrow(() -> Teaching.denied("Assessment not found."));
    }

    private static String sheetId(String a, String c, String s) {
        return a + ":" + c + ":" + s;
    }

    /** Get or lazily create the sheet for an allocation. */
    private MarksSheet ensureSheet(Assessment a, SchoolClass c, Teaching.SubjectTeacher st) {
        String id = sheetId(a.getId(), c.getId(), st.subject());
        return sheets.findById(id).orElseGet(() -> {
            Map<String, Map<String, Object>> rows = new LinkedHashMap<>();
            t.roster(c.getId()).forEach(s -> rows.put(s.getId(), blankRow()));
            return sheets.save(MarksSheet.builder().id(id).assessmentId(a.getId()).classId(c.getId()).subject(st.subject())
                    .teacherStaffId(st.staffId()).status("NOT_STARTED").rowsJson(t.write(rows)).logJson("[]").build());
        });
    }

    private static Map<String, Object> blankRow() {
        Map<String, Object> r = new HashMap<>();
        r.put("internal", null);
        r.put("external", null);
        return r;
    }

    private Map<String, Object> sheetSummary(MarksSheet sh) {
        Assessment a = assessmentOrThrow(sh.getAssessmentId());
        SchoolClass c = t.classOrThrow(sh.getClassId());
        Teaching.ClassSection cs = t.view(c);
        Map<String, Map<String, Object>> rows = t.read(sh.getRowsJson(), ROWS);
        List<Student> roster = t.roster(c.getId());
        boolean needExternal = a.getMaxExternal() > 0;
        long entered = roster.stream().filter(s -> {
            Map<String, Object> r = rows.get(s.getId());
            return r != null && r.get("internal") != null && (!needExternal || r.get("external") != null);
        }).count();
        Map<String, Object> sheet = new LinkedHashMap<>();
        sheet.put("id", sh.getId());
        sheet.put("subject", sh.getSubject());
        sheet.put("status", sh.getStatus());
        if (sh.getReturnReason() != null) sheet.put("returnReason", sh.getReturnReason());
        sheet.put("teacherStaffId", sh.getTeacherStaffId());
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("sheet", sheet);
        m.put("assessment", assessmentView(a));
        m.put("classSection", Map.of("id", c.getId(), "grade", cs.grade(), "section", cs.section()));
        m.put("teacherName", cs.subjectTeachers().stream().filter(x -> x.staffId().equals(sh.getTeacherStaffId())).map(Teaching.SubjectTeacher::name)
                .findFirst().orElse(sh.getTeacherStaffId()));
        m.put("entered", entered);
        m.put("total", roster.size());
        return m;
    }

    private Map<String, Object> sheetView(SchoolPrincipal p, MarksSheet sh) {
        Assessment a = assessmentOrThrow(sh.getAssessmentId());
        SchoolClass c = t.classOrThrow(sh.getClassId());
        boolean owner = p.role() == UserRole.TEACHER && sh.getTeacherStaffId().equals(p.account().getId());
        boolean ct = Teaching.isClassTeacher(p, c);
        if (!owner && !ct && p.role() != UserRole.PRINCIPAL) throw Teaching.denied("You are not assigned to this class and subject.");
        Map<String, Object> full = new LinkedHashMap<>();
        full.put("id", sh.getId());
        full.put("schoolId", sh.getSchoolId());
        full.put("assessmentId", sh.getAssessmentId());
        full.put("classSectionId", sh.getClassId());
        full.put("subject", sh.getSubject());
        full.put("teacherStaffId", sh.getTeacherStaffId());
        full.put("status", sh.getStatus());
        full.put("rows", t.read(sh.getRowsJson(), ROWS));
        if (sh.getReturnReason() != null) full.put("returnReason", sh.getReturnReason());
        full.put("log", t.read(sh.getLogJson(), LIST));
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("sheet", full);
        m.put("assessment", assessmentView(a));
        m.put("classSection", t.view(c));
        m.put("students", t.roster(c.getId()).stream().map(s -> new Teaching.StudentRef(s.getId(), s.getName(), s.getRoll())).toList());
        m.put("canEdit", owner && "OPEN".equals(a.getStatus()) && List.of("NOT_STARTED", "DRAFT", "RETURNED").contains(sh.getStatus()));
        m.put("canReview", ct && "SUBMITTED".equals(sh.getStatus()));
        return m;
    }

    private void log(MarksSheet sh, SchoolPrincipal p, String action, String note) {
        List<Map<String, Object>> log = t.read(sh.getLogJson(), LIST);
        Map<String, Object> e = new LinkedHashMap<>();
        e.put("at", Teaching.now());
        e.put("by", p.account().getId());
        e.put("action", action);
        if (note != null) e.put("note", note);
        log.add(e);
        sh.setLogJson(t.write(log));
    }

    // ------------------------------------------------------------------ subject teacher

    @Transactional(readOnly = true)
    public List<Map<String, Object>> openAssessments(Integer grade) {
        return assessments.findByStatus("OPEN").stream().filter(a -> grade == null || grades(a).contains(grade)).map(this::assessmentView).toList();
    }

    @Transactional
    public List<Map<String, Object>> listMySheets(SchoolPrincipal p) {
        if (p.role() != UserRole.TEACHER) throw Teaching.denied("Only teachers enter marks.");
        List<Map<String, Object>> out = new ArrayList<>();
        for (Assessment a : assessments.findByStatus("OPEN")) {
            for (SchoolClass c : classes.findAll()) {
                if (c.getGradeNumber() == null || !grades(a).contains(c.getGradeNumber()) || t.roster(c.getId()).isEmpty()) continue;
                for (Teaching.SubjectTeacher st : t.view(c).subjectTeachers()) {
                    if (st.staffId().equals(p.account().getId())) out.add(sheetSummary(ensureSheet(a, c, st)));
                }
            }
        }
        out.sort(Comparator.comparingInt(m -> SHEET_ORDER.getOrDefault(((Map<?, ?>) m.get("sheet")).get("status").toString(), 9)));
        return out;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getSheet(SchoolPrincipal p, String id) {
        return sheetView(p, sheets.findById(id == null ? "" : id).orElseThrow(() -> Teaching.denied("Marks sheet not found.")));
    }

    private static boolean valid(Object v, int max) {
        if (v == null || "AB".equals(v)) return true;
        if (v instanceof Integer i) return i >= 0 && i <= max;
        if (v instanceof Number n) return n.doubleValue() == Math.floor(n.doubleValue()) && n.intValue() >= 0 && n.intValue() <= max;
        return false;
    }

    private static Object norm(Object v) {
        return v instanceof Number n ? n.intValue() : v;
    }

    @Transactional
    public Map<String, Object> saveSheet(SchoolPrincipal p, String id, Map<String, Map<String, Object>> rows, boolean submit) {
        MarksSheet sh = sheets.findById(id == null ? "" : id).orElseThrow(() -> Teaching.denied("Marks sheet not found."));
        Map<String, Object> view = sheetView(p, sh);
        if (!Boolean.TRUE.equals(view.get("canEdit"))) throw Teaching.rule("LOCKED", "This sheet cannot be edited now.");
        Assessment a = assessmentOrThrow(sh.getAssessmentId());
        Map<String, Map<String, Object>> in = rows == null ? Map.of() : rows;
        Map<String, Map<String, Object>> next = new LinkedHashMap<>();
        for (Student s : t.roster(sh.getClassId())) {
            Map<String, Object> r = in.getOrDefault(s.getId(), blankRow());
            Object internal = norm(r.get("internal"));
            Object external = norm(r.get("external"));
            if (!valid(internal, a.getMaxInternal()) || (a.getMaxExternal() > 0 && !valid(external, a.getMaxExternal()))) {
                throw Teaching.rule("INVALID", "Check marks for " + s.getRoll() + ". " + s.getName() + ": use 0-max or AB.");
            }
            Map<String, Object> clean = new HashMap<>();
            clean.put("internal", internal);
            clean.put("external", a.getMaxExternal() > 0 ? external : null);
            next.put(s.getId(), clean);
        }
        if (submit) {
            long blank = next.values().stream().filter(r -> r.get("internal") == null || (a.getMaxExternal() > 0 && r.get("external") == null)).count();
            if (blank > 0) throw Teaching.rule("INCOMPLETE", "Enter marks or AB for every student (" + blank + " left).");
        }
        boolean wasReturned = "RETURNED".equals(sh.getStatus());
        sh.setRowsJson(t.write(next));
        sh.setStatus(submit ? "SUBMITTED" : "DRAFT");
        if (submit) sh.setReturnReason(null);
        log(sh, p, submit ? "SUBMITTED" : "SAVED", submit && wasReturned ? "Resubmitted after correction" : null);
        sheets.save(sh);
        return sheetView(p, sh);
    }

    // ------------------------------------------------------------------ class teacher

    @Transactional
    public List<Map<String, Object>> listClassSheets(SchoolPrincipal p, String assessmentId, String classId) {
        SchoolClass c = t.classOrThrow(classId);
        Assessment a = assessmentOrThrow(assessmentId);
        if (!Teaching.isClassTeacher(p, c) && p.role() != UserRole.PRINCIPAL) throw Teaching.denied("Only the Class Teacher reviews this class.");
        return t.view(c).subjectTeachers().stream().map(st -> sheetSummary(ensureSheet(a, c, st))).toList();
    }

    @Transactional
    public Map<String, Object> reviewSheet(SchoolPrincipal p, String id, String action, String reason) {
        MarksSheet sh = sheets.findById(id == null ? "" : id).orElseThrow(() -> Teaching.denied("Marks sheet not found."));
        Map<String, Object> view = sheetView(p, sh);
        if (!Boolean.TRUE.equals(view.get("canReview"))) throw Teaching.rule("STATE", "Only a submitted sheet can be reviewed by the Class Teacher.");
        if ("RETURN".equals(action)) {
            String r = reason == null ? "" : reason.trim();
            if (r.length() < 5) throw Teaching.rule("REASON", "Tell the subject teacher what to correct.");
            sh.setStatus("RETURNED");
            sh.setReturnReason(r);
            log(sh, p, "RETURNED", r);
        } else if ("ACCEPT".equals(action)) {
            sh.setStatus("ACCEPTED");
            log(sh, p, "ACCEPTED", null);
        } else {
            throw Teaching.rule("BAD_ACTION", "Accept or return.");
        }
        sheets.save(sh);
        return sheetView(p, sh);
    }

    private Map<String, Object> cardView(ReportCard c) {
        Student st = t.students.findById(c.getStudentId()).orElse(null);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", c.getId());
        m.put("schoolId", c.getSchoolId());
        m.put("assessmentId", c.getAssessmentId());
        m.put("classSectionId", c.getClassId());
        m.put("studentId", c.getStudentId());
        m.put("subjects", t.read(c.getSubjectsJson(), LIST));
        m.put("classTeacherRemark", c.getClassTeacherRemark());
        m.put("status", c.getStatus());
        if (c.getPrincipalNote() != null) m.put("principalNote", c.getPrincipalNote());
        m.put("log", t.read(c.getLogJson(), LIST));
        m.put("studentName", st == null ? c.getStudentId() : st.getName());
        m.put("rollNumber", st == null ? "" : st.getRoll());
        return m;
    }

    private void cardLog(ReportCard c, SchoolPrincipal p, String action, String note) {
        List<Map<String, Object>> log = t.read(c.getLogJson(), LIST);
        Map<String, Object> e = new LinkedHashMap<>();
        e.put("at", Teaching.now());
        e.put("by", p.account().getId());
        e.put("action", action);
        if (note != null) e.put("note", note);
        log.add(e);
        c.setLogJson(t.write(log));
    }

    private SchoolClass ctClass(SchoolPrincipal p, String classId, String msg) {
        SchoolClass c = t.classOrThrow(classId);
        if (!Teaching.isClassTeacher(p, c)) throw Teaching.denied(msg);
        return c;
    }

    @Transactional
    public List<Map<String, Object>> generateReportCards(SchoolPrincipal p, String assessmentId, String classId) {
        SchoolClass c = ctClass(p, classId, "Only the Class Teacher generates report cards.");
        Assessment a = assessmentOrThrow(assessmentId);
        List<MarksSheet> ss = t.view(c).subjectTeachers().stream().map(st -> ensureSheet(a, c, st)).toList();
        List<String> notAccepted = ss.stream().filter(s -> !"ACCEPTED".equals(s.getStatus())).map(MarksSheet::getSubject).toList();
        if (!notAccepted.isEmpty()) throw Teaching.rule("NOT_READY", "Accept all subjects first: " + String.join(", ", notAccepted) + ".");
        List<ReportCard> existing = cards.findByAssessmentIdAndClassId(a.getId(), c.getId());
        if (existing.stream().anyMatch(x -> List.of("SUBMITTED", "APPROVED", "PUBLISHED").contains(x.getStatus()))) {
            throw Teaching.rule("LOCKED", "Report cards are already with the Principal or published.");
        }
        int total = a.getMaxInternal() + a.getMaxExternal();
        List<String> second = secondLanguages(a);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Student st : t.roster(c.getId())) {
            ReportCard prev = existing.stream().filter(x -> x.getStudentId().equals(st.getId())).findFirst().orElse(null);
            List<Map<String, Object>> subjects = new ArrayList<>();
            for (MarksSheet sh : ss) {
                Map<String, Object> r = t.read(sh.getRowsJson(), ROWS).getOrDefault(st.getId(), blankRow());
                Map<String, Object> sub = new LinkedHashMap<>();
                sub.put("subject", sh.getSubject());
                sub.put("internal", r.get("internal") == null ? "AB" : r.get("internal"));
                sub.put("external", a.getMaxExternal() > 0 ? (r.get("external") == null ? "AB" : r.get("external")) : 0);
                sub.put("maxInternal", a.getMaxInternal());
                sub.put("maxExternal", a.getMaxExternal());
                int pct = second.contains(sh.getSubject()) ? a.getSecondLanguagePassPercent() : a.getPassPercent();
                sub.put("passMark", (int) Math.ceil(total * pct / 100.0));
                subjects.add(sub);
            }
            ReportCard card = prev != null ? prev : ReportCard.builder().id(a.getId() + ":" + st.getId()).assessmentId(a.getId()).classId(c.getId())
                    .studentId(st.getId()).classTeacherRemark("").logJson("[]").build();
            card.setSubjectsJson(t.write(subjects));
            card.setStatus(prev != null && "RETURNED".equals(prev.getStatus()) ? "RETURNED" : "DRAFT");
            cardLog(card, p, "GENERATED", null);
            out.add(cardView(cards.save(card)));
        }
        return out;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> listReportCards(SchoolPrincipal p, String assessmentId, String classId) {
        SchoolClass c = t.classOrThrow(classId);
        if (!Teaching.isClassTeacher(p, c) && p.role() != UserRole.PRINCIPAL) throw Teaching.denied("Only the Class Teacher or Principal sees these cards.");
        return cards.findByAssessmentIdAndClassId(assessmentId, c.getId()).stream().map(this::cardView)
                .sorted(Comparator.comparing(m -> m.get("rollNumber").toString())).toList();
    }

    @Transactional
    public Map<String, Object> updateRemark(SchoolPrincipal p, String cardId, String remark) {
        ReportCard c = cards.findById(cardId == null ? "" : cardId).orElseThrow(() -> Teaching.denied("Report card not found."));
        ctClass(p, c.getClassId(), "Only the Class Teacher writes remarks.");
        if (!"DRAFT".equals(c.getStatus()) && !"RETURNED".equals(c.getStatus())) throw Teaching.rule("LOCKED", "This card is locked.");
        String r = remark == null ? "" : remark.trim();
        c.setClassTeacherRemark(r.length() > 300 ? r.substring(0, 300) : r);
        return cardView(cards.save(c));
    }

    @Transactional
    public List<Map<String, Object>> submitToPrincipal(SchoolPrincipal p, String assessmentId, String classId) {
        SchoolClass c = ctClass(p, classId, "Only the Class Teacher submits report cards.");
        List<ReportCard> cs = cards.findByAssessmentIdAndClassId(assessmentId, c.getId());
        if (cs.isEmpty()) throw Teaching.rule("NOT_READY", "Generate report cards first.");
        List<ReportCard> toSend = cs.stream().filter(x -> "DRAFT".equals(x.getStatus()) || "RETURNED".equals(x.getStatus())).toList();
        if (toSend.isEmpty()) throw Teaching.rule("NOTHING", "Nothing to submit.");
        long noRemark = toSend.stream().filter(x -> x.getClassTeacherRemark() == null || x.getClassTeacherRemark().isBlank()).count();
        if (noRemark > 0) throw Teaching.rule("REMARKS", "Add a remark for every student (" + noRemark + " left).");
        toSend.forEach(x -> {
            x.setStatus("SUBMITTED");
            cardLog(x, p, "SUBMITTED_TO_PRINCIPAL", null);
            cards.save(x);
        });
        return cs.stream().map(this::cardView).toList();
    }

    // ------------------------------------------------------------------ principal

    @Transactional
    public Map<String, Object> principalDecide(SchoolPrincipal p, String cardId, String decision, String note) {
        if (p.role() != UserRole.PRINCIPAL) throw Teaching.denied("Only the Principal approves report cards.");
        ReportCard c = cards.findById(cardId == null ? "" : cardId).orElseThrow(() -> Teaching.denied("Report card not found."));
        if (!"SUBMITTED".equals(c.getStatus())) throw Teaching.rule("STATE", "This card is not waiting for approval.");
        if ("RETURN".equals(decision)) {
            String n = note == null ? "" : note.trim();
            if (n.length() < 5) throw Teaching.rule("REASON", "Tell the Class Teacher what to correct.");
            c.setStatus("RETURNED");
            c.setPrincipalNote(n);
        } else if ("APPROVE".equals(decision)) {
            c.setStatus("APPROVED");
            c.setPrincipalNote(null);
        } else {
            throw Teaching.rule("BAD_DECISION", "Approve or return.");
        }
        cardLog(c, p, "APPROVE".equals(decision) ? "APPROVED" : "RETURNED", note);
        return cardView(cards.save(c));
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> listForPrincipal(SchoolPrincipal p) {
        if (p.role() != UserRole.PRINCIPAL) throw Teaching.denied("Only the Principal approves report cards.");
        Map<String, List<ReportCard>> groups = new LinkedHashMap<>();
        cards.findByStatusNot("DRAFT").forEach(c -> groups.computeIfAbsent(c.getAssessmentId() + "|" + c.getClassId(), k -> new ArrayList<>()).add(c));
        List<Map<String, Object>> out = new ArrayList<>();
        groups.forEach((k, list) -> {
            String[] ids = k.split("\\|");
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("classSection", t.view(t.classOrThrow(ids[1])));
            m.put("assessment", assessmentView(assessmentOrThrow(ids[0])));
            m.put("cards", list.stream().map(this::cardView).sorted(Comparator.comparing(x -> x.get("rollNumber").toString())).toList());
            out.add(m);
        });
        return out;
    }

    // ------------------------------------------------------------------ publish (Class Teacher only)

    @Transactional
    public Map<String, Object> publish(SchoolPrincipal p, String assessmentId, String classId) {
        SchoolClass c = ctClass(p, classId, "Only the Class Teacher publishes results.");
        Assessment a = assessmentOrThrow(assessmentId);
        List<ReportCard> cs = cards.findByAssessmentIdAndClassId(a.getId(), c.getId());
        if (cs.isEmpty()) throw Teaching.rule("NOT_READY", "No report cards yet.");
        long notApproved = cs.stream().filter(x -> !"APPROVED".equals(x.getStatus())).count();
        if (notApproved > 0) throw Teaching.rule("NOT_READY", "Publication waits until all cards are approved (" + notApproved + " pending).");
        String today = ParentDataService.today();
        for (ReportCard card : cs) {
            List<PublishedResult> prior = results.findByStudentId(card.getStudentId()).stream().filter(r -> r.getExamName().equals(a.getName())).toList();
            prior.forEach(r -> {
                r.setStatus("SUPERSEDED");
                results.save(r);
            });
            int version = prior.stream().mapToInt(PublishedResult::getVersion).max().orElse(0) + 1;
            results.save(PublishedResult.builder().id("RES-" + card.getId() + "-v" + version).studentId(card.getStudentId()).examName(a.getName())
                    .version(version).status("CURRENT").publishedOn(today).subjectsJson(card.getSubjectsJson())
                    .classTeacherRemark(card.getClassTeacherRemark()).build());
            card.setStatus("PUBLISHED");
            cardLog(card, p, "PUBLISHED", "v" + version);
            cards.save(card);
        }
        t.record(p, "RESULTS_PUBLISHED", a.getId() + ":" + c.getId(),
                a.getName() + " results published for Class " + c.getGradeNumber() + "-" + c.getSection() + " (" + cs.size() + " students).", null);
        return Map.of("published", cs.size());
    }

    // ------------------------------------------------------------------ assignments

    @Transactional(readOnly = true)
    public Map<String, Object> assignments(SchoolPrincipal p) {
        String me = p.account().getId();
        Teaching.ClassSection ctOf = null;
        List<Map<String, Object>> teaching = new ArrayList<>();
        for (SchoolClass c : classes.findAll()) {
            Teaching.ClassSection v = t.view(c);
            if (me.equals(c.getClassTeacherId())) ctOf = v;
            for (Teaching.SubjectTeacher st : v.subjectTeachers()) {
                if (st.staffId().equals(me)) teaching.add(Map.of("classSection", v, "subject", st.subject()));
            }
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("classTeacherOf", ctOf);
        m.put("teaching", teaching);
        return m;
    }

    @Transactional(readOnly = true)
    public List<Teaching.ClassSection> listClasses() {
        return classes.findAll().stream().map(t::view)
                .sorted(Comparator.comparingInt(Teaching.ClassSection::grade).reversed().thenComparing(Teaching.ClassSection::section)).toList();
    }
}
