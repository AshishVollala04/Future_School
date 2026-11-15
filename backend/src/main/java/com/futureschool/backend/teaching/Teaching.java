package com.futureschool.backend.teaching;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.futureschool.backend.auth.AuthFlowException;
import com.futureschool.backend.entity.*;
import com.futureschool.backend.repository.*;
import com.futureschool.backend.security.SchoolPrincipal;
import com.futureschool.backend.tenant.TenantContext;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.util.*;

/**
 * Shared helpers for the staff side: class structure, rosters, relationship checks, JSON, audit.
 * All repository calls are school-filtered.
 */
@Component
public class Teaching {

    public record SubjectTeacher(String subject, String staffId, String name) {
    }

    public record ClassSection(String id, String schoolId, int grade, String section, String classTeacherStaffId, String classTeacherName,
                               List<SubjectTeacher> subjectTeachers) {
    }

    public record StudentRef(String id, String name, String rollNumber) {
    }

    final SchoolClassRepository classes;
    final ClassSubjectTeacherRepository subjectTeachers;
    final StudentRepository students;
    final AuditEventRepository audit;
    final ObjectMapper json;

    public Teaching(SchoolClassRepository classes, ClassSubjectTeacherRepository subjectTeachers, StudentRepository students,
                    AuditEventRepository audit, ObjectMapper json) {
        this.classes = classes;
        this.subjectTeachers = subjectTeachers;
        this.students = students;
        this.audit = audit;
        this.json = json;
    }

    public static AuthFlowException denied(String msg) {
        return new AuthFlowException("FORBIDDEN", msg, null, 403);
    }

    public static AuthFlowException rule(String code, String msg) {
        return new AuthFlowException(code, msg, null, 400);
    }

    public static String now() {
        return OffsetDateTime.now(com.futureschool.backend.parent.ParentDataService.SCHOOL_ZONE).toString();
    }

    public SchoolClass classOrThrow(String classId) {
        return classes.findById(classId == null ? "" : classId).orElseThrow(() -> denied("Class not found in this school."));
    }

    public ClassSection view(SchoolClass c) {
        List<SubjectTeacher> st = subjectTeachers.findByClassIdOrderByIdAsc(c.getId()).stream()
                .map(t -> new SubjectTeacher(t.getSubject(), t.getStaffId(), t.getStaffName())).toList();
        return new ClassSection(c.getId(), c.getSchoolId(), c.getGradeNumber() == null ? 0 : c.getGradeNumber(), c.getSection(),
                c.getClassTeacherId(), c.getClassTeacherName(), st);
    }

    public List<Student> roster(String classId) {
        return students.findByClassIdAndStatusOrderByRollAsc(classId, "Active");
    }

    public static boolean isClassTeacher(SchoolPrincipal p, SchoolClass c) {
        return p.role() == UserRole.TEACHER && p.account().getId().equals(c.getClassTeacherId());
    }

    public static boolean isLeadership(SchoolPrincipal p) {
        return p.role() == UserRole.PRINCIPAL || p.role() == UserRole.ADMIN;
    }

    public void record(SchoolPrincipal p, String action, String targetId, String details, String reason) {
        audit.save(AuditEvent.builder().id("AUD-" + UUID.randomUUID()).action(action).actorId(p.account().getId())
                .actorRole(p.role().name()).targetId(targetId).details(details).reason(reason).at(now()).build());
    }

    public String write(Object o) {
        try {
            return json.writeValueAsString(o);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    public <T> T read(String s, TypeReference<T> type) {
        try {
            return json.readValue(s, type);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    public StudentRepository students() {
        return students;
    }

    public SchoolClassRepository classes() {
        return classes;
    }

    public String school() {
        return TenantContext.require();
    }
}
