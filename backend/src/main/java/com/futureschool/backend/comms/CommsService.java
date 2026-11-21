package com.futureschool.backend.comms;

import com.fasterxml.jackson.core.type.TypeReference;
import com.futureschool.backend.entity.*;
import com.futureschool.backend.parent.ParentDataService;
import com.futureschool.backend.repository.*;
import com.futureschool.backend.security.SchoolPrincipal;
import com.futureschool.backend.teaching.Teaching;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * Notices, parent-teacher messages, consent, meetings and homework.
 *
 *  - Parents act for the SESSION child only.
 *  - A parent may message ONLY the child's Class Teacher or the child's Subject Teachers (no directory).
 *    A teacher sees and replies only to threads addressed to them.
 *  - Consent is final from the parent side, attributable to the guardian, and never rewritten by staff.
 *  - Homework is posted by the Subject Teacher of that class + subject; status is per student.
 *  - Notices: Principal/Admin for any audience; a Class Teacher only for their own class.
 */
@Service
public class CommsService {

    private static final int MAX_BODY = 1000;
    private static final Set<String> CATEGORIES = Set.of("ACADEMIC_PROGRESS", "HOMEWORK", "ATTENDANCE", "CONDUCT", "EXAM_MARKS", "GENERAL");
    private static final Set<String> PRIORITIES = Set.of("NORMAL", "IMPORTANT", "EMERGENCY");
    private static final Set<String> SUBMISSION = Set.of("NOTEBOOK", "WORKSHEET", "NONE");
    private static final Set<String> HW_STATUS = Set.of("PENDING", "SUBMITTED", "CHECKED");
    private static final Map<String, Integer> PRIORITY_RANK = Map.of("EMERGENCY", 0, "IMPORTANT", 1, "NORMAL", 2);
    private static final TypeReference<List<Map<String, Object>>> LIST = new TypeReference<>() {
    };
    private static final TypeReference<Map<String, String>> MAP = new TypeReference<>() {
    };

    private final Teaching t;
    private final ClassNoticeRepository notices;
    private final HomeworkTaskRepository homework;
    private final ConsentFormRepository consents;
    private final ConsentResponseRepository responses;
    private final MessageThreadRepository threads;
    private final ParentMeetingRepository meetings;

    public CommsService(Teaching t, ClassNoticeRepository notices, HomeworkTaskRepository homework, ConsentFormRepository consents,
                        ConsentResponseRepository responses, MessageThreadRepository threads, ParentMeetingRepository meetings) {
        this.t = t;
        this.notices = notices;
        this.homework = homework;
        this.consents = consents;
        this.responses = responses;
        this.threads = threads;
        this.meetings = meetings;
    }

    private Student child(SchoolPrincipal p) {
        if (p.role() != UserRole.PARENT || p.sessionStudentId() == null) throw Teaching.denied("This is a parent view.");
        return t.students().findById(p.sessionStudentId()).orElseThrow(() -> Teaching.denied("Student not found."));
    }

    private static String trimTo(String s, int max) {
        String v = s == null ? "" : s.trim();
        return v.length() > max ? v.substring(0, max) : v;
    }

    // ================================================================== notices

    private Map<String, Object> noticeView(ClassNotice n) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", n.getId());
        m.put("schoolId", n.getSchoolId());
        m.put("audience", "ALL".equals(n.getAudienceCsv()) ? "ALL" : List.of(n.getAudienceCsv().split(",")));
        m.put("title", n.getTitle());
        m.put("body", n.getBody());
        m.put("publishedAt", n.getPublishedAt());
        m.put("priority", n.getPriority());
        return m;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> noticesFor(SchoolPrincipal p) {
        String classId = p.role() == UserRole.PARENT ? child(p).getClassId() : null;
        return notices.findAll().stream()
                .filter(n -> classId == null || "ALL".equals(n.getAudienceCsv()) || List.of(n.getAudienceCsv().split(",")).contains(classId))
                .sorted(Comparator.comparingInt((ClassNotice n) -> PRIORITY_RANK.getOrDefault(n.getPriority(), 9))
                        .thenComparing(ClassNotice::getPublishedAt, Comparator.reverseOrder()))
                .map(this::noticeView).toList();
    }

    @Transactional
    public Map<String, Object> publishNotice(SchoolPrincipal p, List<String> audience, String title, String body, String priority) {
        boolean all = audience == null || audience.isEmpty() || audience.contains("ALL");
        if (!Teaching.isLeadership(p)) {
            if (all) throw Teaching.denied("Only the Principal or Admin can send a notice to the whole school.");
            // Teachers: only classes they are assigned to (Class Teacher or Subject Teacher). classOrThrow is
            // school-filtered, so another school's class id is "not found" here.
            for (String c : audience) {
                if (!t.isAssignedTeacher(p, t.classOrThrow(c))) throw Teaching.denied("You can send notices only to classes you teach.");
            }
        } else if (!all) {
            audience.forEach(t::classOrThrow);
        }
        String ti = trimTo(title, 200), b = trimTo(body, 2000);
        if (ti.length() < 3 || b.length() < 5) throw Teaching.rule("EMPTY", "Add a title and the notice text.");
        String pr = priority == null ? "NORMAL" : priority;
        if (!PRIORITIES.contains(pr)) throw Teaching.rule("PRIORITY", "Choose normal, important or emergency.");
        if ("EMERGENCY".equals(pr) && !Teaching.isLeadership(p)) throw Teaching.denied("Only the Principal or Admin sends emergency notices.");
        ClassNotice n = notices.save(ClassNotice.builder().id("NT-" + t.school() + "-" + UUID.randomUUID().toString().substring(0, 8))
                .audienceCsv(all ? "ALL" : String.join(",", audience)).title(ti).body(b).priority(pr).publishedAt(Teaching.now())
                .publishedBy(p.account().getId()).build());
        t.record(p, "NOTICE_PUBLISHED", n.getId(), pr + ": " + ti, null);
        return noticeView(n);
    }

    // ================================================================== messages

    /** Class Teacher + Subject Teachers of the session child's class. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> recipients(SchoolPrincipal p) {
        Teaching.ClassSection cs = t.view(t.classOrThrow(child(p).getClassId()));
        Map<String, Map<String, Object>> out = new LinkedHashMap<>();
        if (cs.classTeacherStaffId() != null) {
            out.put(cs.classTeacherStaffId(), new LinkedHashMap<>(Map.of("staffId", cs.classTeacherStaffId(), "name", cs.classTeacherName(), "role", "Class Teacher")));
        }
        for (Teaching.SubjectTeacher st : cs.subjectTeachers()) {
            Map<String, Object> r = out.get(st.staffId());
            if (r != null) r.put("role", r.get("role") + " · " + st.subject());
            else out.put(st.staffId(), new LinkedHashMap<>(Map.of("staffId", st.staffId(), "name", st.name(), "role", st.subject())));
        }
        return new ArrayList<>(out.values());
    }

    private Map<String, Object> threadView(MessageThread th) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", th.getId());
        m.put("schoolId", th.getSchoolId());
        m.put("studentId", th.getStudentId());
        m.put("teacherStaffId", th.getTeacherStaffId());
        m.put("teacherName", th.getTeacherName());
        m.put("teacherRole", th.getTeacherRole());
        m.put("category", th.getCategory());
        m.put("subject", th.getSubject());
        m.put("messages", t.read(th.getMessagesJson(), LIST));
        t.students().findById(th.getStudentId()).ifPresent(s -> {
            m.put("studentName", s.getName());
            m.put("classLabel", ParentDataService.gradeOf(s) + "-" + s.getSection());
        });
        return m;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> parentThreads(SchoolPrincipal p) {
        Student s = child(p);
        return threads.findAll().stream().filter(th -> th.getStudentId().equals(s.getId()))
                .sorted(Comparator.comparing(MessageThread::getLastAt).reversed()).map(this::threadView).toList();
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> teacherThreads(SchoolPrincipal p) {
        if (p.role() != UserRole.TEACHER) throw Teaching.denied("Only teachers have a message inbox here.");
        return threads.findAll().stream().filter(th -> th.getTeacherStaffId().equals(p.account().getId()))
                .sorted(Comparator.comparing(MessageThread::getLastAt).reversed()).map(this::threadView).toList();
    }

    private static Map<String, Object> message(String from, String author, String body) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("from", from);
        m.put("author", author);
        m.put("body", body);
        m.put("at", Teaching.now());
        return m;
    }

    private static String body(String raw) {
        String b = raw == null ? "" : raw.trim();
        if (b.isEmpty()) throw Teaching.rule("EMPTY", "Write a message.");
        if (b.length() > MAX_BODY) throw Teaching.rule("TOO_LONG", "Keep messages under " + MAX_BODY + " characters.");
        return b;
    }

    @Transactional
    public Map<String, Object> startThread(SchoolPrincipal p, String staffId, String category, String subject, String text) {
        Student s = child(p);
        Map<String, Object> r = recipients(p).stream().filter(x -> x.get("staffId").equals(staffId)).findFirst()
                .orElseThrow(() -> Teaching.denied("You can message only your child's class teacher or subject teachers."));
        String subj = trimTo(subject, 200);
        if (subj.isEmpty()) throw Teaching.rule("EMPTY", "Add a subject and a message.");
        if (category == null || !CATEGORIES.contains(category)) throw Teaching.rule("CATEGORY", "Choose what the message is about.");
        String b = body(text);
        MessageThread th = MessageThread.builder().id("TH-" + t.school() + "-" + UUID.randomUUID().toString().substring(0, 8)).studentId(s.getId())
                .teacherStaffId(staffId).teacherName(r.get("name").toString()).teacherRole(r.get("role").toString()).category(category).subject(subj)
                .messagesJson(t.write(List.of(message("PARENT", p.account().getName(), b)))).lastAt(Teaching.now()).build();
        return threadView(threads.save(th));
    }

    @Transactional
    public Map<String, Object> reply(SchoolPrincipal p, String threadId, String text) {
        MessageThread th = threads.findById(threadId == null ? "" : threadId).orElseThrow(() -> Teaching.denied("Conversation not found."));
        String from;
        if (p.role() == UserRole.PARENT) {
            if (!th.getStudentId().equals(child(p).getId())) throw Teaching.denied("Conversation not found.");
            from = "PARENT";
        } else if (p.role() == UserRole.TEACHER && th.getTeacherStaffId().equals(p.account().getId())) {
            from = "TEACHER";
        } else {
            throw Teaching.denied("Conversation not found.");
        }
        List<Map<String, Object>> msgs = new ArrayList<>(t.read(th.getMessagesJson(), LIST));
        msgs.add(message(from, p.account().getName(), body(text)));
        th.setMessagesJson(t.write(msgs));
        th.setLastAt(Teaching.now());
        return threadView(threads.save(th));
    }

    // ================================================================== consent

    private Map<String, Object> consentView(ConsentForm c, String studentId) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", c.getId());
        m.put("schoolId", c.getSchoolId());
        m.put("classSectionIds", List.of(c.getClassIdsCsv().split(",")));
        m.put("title", c.getTitle());
        m.put("details", c.getDetails());
        m.put("dueOn", c.getDueOn());
        responses.findAll().stream().filter(r -> r.getConsentId().equals(c.getId()) && r.getStudentId().equals(studentId)).findFirst()
                .ifPresent(r -> m.put("response", Map.of("decision", r.getDecision(), "guardianId", r.getGuardianId(), "at", r.getAt())));
        m.put("expired", c.getDueOn().compareTo(ParentDataService.today()) < 0);
        return m;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> consentsFor(SchoolPrincipal p) {
        Student s = child(p);
        return consents.findAll().stream().filter(c -> List.of(c.getClassIdsCsv().split(",")).contains(s.getClassId()))
                .map(c -> consentView(c, s.getId())).toList();
    }

    @Transactional
    public Map<String, Object> respondConsent(SchoolPrincipal p, String consentId, String decision) {
        Student s = child(p);
        ConsentForm c = consents.findById(consentId == null ? "" : consentId).filter(x -> List.of(x.getClassIdsCsv().split(",")).contains(s.getClassId()))
                .orElseThrow(() -> Teaching.denied("Consent request not found."));
        if (!"GIVEN".equals(decision) && !"DECLINED".equals(decision)) throw Teaching.rule("BAD_DECISION", "Give or decline consent.");
        if (responses.findAll().stream().anyMatch(r -> r.getConsentId().equals(c.getId()) && r.getStudentId().equals(s.getId()))) {
            throw Teaching.rule("ALREADY_RESPONDED", "You have already responded. Contact the school to change it.");
        }
        if (c.getDueOn().compareTo(ParentDataService.today()) < 0) throw Teaching.rule("EXPIRED", "The response window has closed.");
        responses.save(ConsentResponse.builder().id("CR-" + c.getId() + "-" + s.getId()).consentId(c.getId()).studentId(s.getId())
                .decision(decision).guardianId(p.account().getId()).at(Teaching.now()).build());
        t.record(p, "CONSENT_RESPONSE", s.getId(), decision + " for \"" + c.getTitle() + "\".", null);
        return consentView(c, s.getId());
    }

    // ================================================================== meetings

    @Transactional(readOnly = true)
    public List<Map<String, Object>> meetingsFor(SchoolPrincipal p) {
        Student s = child(p);
        return meetings.findAll().stream().filter(m -> m.getStudentId().equals(s.getId())).sorted(Comparator.comparing(ParentMeeting::getAt)).map(m -> {
            Map<String, Object> v = new LinkedHashMap<>();
            v.put("id", m.getId());
            v.put("schoolId", m.getSchoolId());
            v.put("studentId", m.getStudentId());
            v.put("teacherName", m.getTeacherName());
            v.put("purpose", m.getPurpose());
            v.put("at", m.getAt());
            v.put("status", m.getStatus());
            if (m.getParentSummary() != null) v.put("parentSummary", m.getParentSummary());
            return v;
        }).toList();
    }

    // ================================================================== homework

    private Map<String, Object> homeworkBase(HomeworkTask h) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", h.getId());
        m.put("schoolId", h.getSchoolId());
        m.put("classSectionId", h.getClassId());
        m.put("subject", h.getSubject());
        m.put("teacherName", h.getTeacherName());
        m.put("title", h.getTitle());
        m.put("instructions", h.getInstructions());
        m.put("assignedOn", h.getAssignedOn());
        m.put("dueOn", h.getDueOn());
        m.put("submissionType", h.getSubmissionType());
        return m;
    }

    /** Parent: the child's homework with its own status; overdue = still pending after the due date. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> homeworkForChild(SchoolPrincipal p) {
        Student s = child(p);
        String today = ParentDataService.today();
        return homework.findAll().stream().filter(h -> h.getClassId().equals(s.getClassId())).map(h -> {
            Map<String, Object> m = homeworkBase(h);
            String st = t.read(h.getStatusJson(), MAP).getOrDefault(s.getId(), "PENDING");
            m.put("status", st);
            m.put("overdue", "PENDING".equals(st) && h.getDueOn().compareTo(today) < 0);
            return m;
        }).sorted(Comparator.comparing((Map<String, Object> m) -> !(Boolean) m.get("overdue")).thenComparing(m -> m.get("dueOn").toString())).toList();
    }

    private boolean teaches(SchoolPrincipal p, String classId, String subject) {
        return p.role() == UserRole.TEACHER && t.view(t.classOrThrow(classId)).subjectTeachers().stream()
                .anyMatch(s -> s.subject().equals(subject) && s.staffId().equals(p.account().getId()));
    }

    /** Teacher: homework I posted (all my classes), with each student's status. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> myHomework(SchoolPrincipal p) {
        if (p.role() != UserRole.TEACHER) throw Teaching.denied("Only teachers post homework.");
        return homework.findAll().stream().filter(h -> h.getTeacherStaffId().equals(p.account().getId()))
                .sorted(Comparator.comparing(HomeworkTask::getDueOn).reversed()).map(h -> {
                    Map<String, Object> m = homeworkBase(h);
                    Map<String, String> status = t.read(h.getStatusJson(), MAP);
                    SchoolClass c = t.classes().findById(h.getClassId()).orElse(null);
                    m.put("classLabel", c != null ? c.getGradeNumber() + "-" + c.getSection() : h.getClassId());
                    m.put("students", t.roster(h.getClassId()).stream().map(s -> Map.of("id", s.getId(), "name", s.getName(), "rollNumber", s.getRoll(),
                            "status", status.getOrDefault(s.getId(), "PENDING"))).toList());
                    return m;
                }).toList();
    }

    @Transactional
    public Map<String, Object> postHomework(SchoolPrincipal p, String classId, String subject, String title, String instructions, String dueOn, String submissionType) {
        if (!teaches(p, classId, subject)) throw Teaching.denied("Only the subject teacher of this class can post this homework.");
        String ti = trimTo(title, 200);
        if (ti.length() < 3) throw Teaching.rule("TITLE", "Add a title.");
        String today = ParentDataService.today();
        if (dueOn == null || dueOn.compareTo(today) < 0) throw Teaching.rule("DATES", "The due date cannot be in the past.");
        String type = submissionType == null ? "NOTEBOOK" : submissionType;
        if (!SUBMISSION.contains(type)) throw Teaching.rule("TYPE", "Choose notebook, worksheet or none.");
        HomeworkTask h = homework.save(HomeworkTask.builder().id("HW-" + t.school() + "-" + UUID.randomUUID().toString().substring(0, 8)).classId(classId)
                .subject(subject).teacherStaffId(p.account().getId()).teacherName(p.account().getName()).title(ti).instructions(trimTo(instructions, 1000))
                .assignedOn(today).dueOn(dueOn).submissionType(type).statusJson("{}").build());
        return homeworkBase(h);
    }

    @Transactional
    public Map<String, Object> setHomeworkStatus(SchoolPrincipal p, String id, String studentId, String status) {
        HomeworkTask h = homework.findById(id == null ? "" : id).orElseThrow(() -> Teaching.denied("Homework not found."));
        if (!h.getTeacherStaffId().equals(p.account().getId())) throw Teaching.denied("Only the teacher who set this homework updates it.");
        if (status == null || !HW_STATUS.contains(status)) throw Teaching.rule("STATUS", "Choose pending, submitted or checked.");
        if (t.roster(h.getClassId()).stream().noneMatch(s -> s.getId().equals(studentId))) throw Teaching.denied("Student is not in this class.");
        Map<String, String> m = new LinkedHashMap<>(t.read(h.getStatusJson(), MAP));
        m.put(studentId, status);
        h.setStatusJson(t.write(m));
        homework.save(h);
        return Map.of("id", h.getId(), "studentId", studentId, "status", status);
    }
}
