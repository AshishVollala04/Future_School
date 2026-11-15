package com.futureschool.backend.security;

import com.futureschool.backend.entity.UserRole;
import com.futureschool.backend.repository.StudentRepository;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Relationship checks used by SecurityConfig: School -> Role -> Relationship.
 * The school check is already done by the tenant filter (other schools' rows are invisible);
 * this adds "is this student yours?" for parents and students.
 */
@Component("access")
public class AccessPolicy {

    private final StudentRepository students;

    public AccessPolicy(StudentRepository students) {
        this.students = students;
    }

    public static SchoolPrincipal principal(Authentication auth) {
        return auth != null && auth.getPrincipal() instanceof SchoolPrincipal p ? p : null;
    }

    /** Staff: any student in their school. Parent: only linked children. Student: only self. */
    public boolean canReadStudent(Authentication auth, String studentId) {
        SchoolPrincipal p = principal(auth);
        if (p == null || studentId == null) return false;
        boolean related = switch (p.role()) {
            case ADMIN, PRINCIPAL, TEACHER -> true;
            // A parent session is for one child: other linked children need a child switch.
            case PARENT -> linkedStudents(p).contains(studentId) && studentId.equals(p.sessionStudentId());
            case STUDENT -> studentId.equals(p.account().getStudentId());
        };
        // existsById is school-filtered, so a student of another school is "not found".
        return related && students.existsById(studentId);
    }

    /** A parent may list children only for their own parent account. */
    public boolean isOwnParentAccount(Authentication auth, String parentAccountId) {
        SchoolPrincipal p = principal(auth);
        if (p == null) return false;
        if (p.isStaff()) return true;
        return p.role() == UserRole.PARENT
                && (parentAccountId.equalsIgnoreCase(p.loginId()) || parentAccountId.equals(p.account().getId()));
    }

    public List<String> linkedStudents(SchoolPrincipal p) {
        return p.account().getLinkedStudentIds() == null ? List.of() : p.account().getLinkedStudentIds();
    }
}
