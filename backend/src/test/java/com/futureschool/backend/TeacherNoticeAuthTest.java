package com.futureschool.backend;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.futureschool.backend.entity.ClassSubjectTeacher;
import com.futureschool.backend.entity.SchoolClass;
import com.futureschool.backend.repository.ClassSubjectTeacherRepository;
import com.futureschool.backend.repository.SchoolClassRepository;
import com.futureschool.backend.tenant.TenantContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Who may post a class notice: a teacher only to classes they are assigned to (Class Teacher or
 * Subject Teacher), Normal or Important only; whole-school and Emergency notices are for the
 * Principal / Admin. Every audience class must belong to the signed-in school.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class TeacherNoticeAuthTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired ClassSubjectTeacherRepository subjectTeachers;
    @Autowired SchoolClassRepository classes;
    @Autowired TransactionTemplate tx;

    Api api;
    static final String NAIR = "STF-T-0002"; // Raghavan Nair: Class Teacher 10-B, Mathematics in 10-A

    @BeforeEach
    void setUp() {
        api = new Api(mvc, json);
    }

    @AfterEach
    void clearTenant() {
        TenantContext.clear();
    }

    private static Map<String, Object> notice(List<String> audience, String priority) {
        return Map.of("audience", audience, "title", "Unit test on Friday", "body", "Revise chapters 4 and 5.", "priority", priority);
    }

    /** Classes in GVS where Nair teaches a subject but is not the Class Teacher, and classes he is not assigned to at all. */
    private Map<String, List<String>> nairsClasses() {
        return TenantContext.callAs("GVS", () -> tx.execute(s -> {
            Set<String> subjectOf = subjectTeachers.findAll().stream().filter(t -> NAIR.equals(t.getStaffId()))
                    .map(ClassSubjectTeacher::getClassId).collect(Collectors.toSet());
            List<SchoolClass> all = classes.findAll();
            List<String> subjectOnly = all.stream().filter(c -> subjectOf.contains(c.getId()) && !NAIR.equals(c.getClassTeacherId())).map(SchoolClass::getId).toList();
            List<String> unassigned = all.stream().filter(c -> !subjectOf.contains(c.getId()) && !NAIR.equals(c.getClassTeacherId())).map(SchoolClass::getId).toList();
            return Map.of("subjectOnly", subjectOnly, "unassigned", unassigned);
        }));
    }

    @Test
    void aSubjectTeacherCanPostToTheirClassButNotToOthers() throws Exception {
        Map<String, List<String>> mine = nairsClasses();
        assertFalse(mine.get("subjectOnly").isEmpty(), "fixture: Nair teaches a subject in a class he is not class teacher of");
        assertFalse(mine.get("unassigned").isEmpty(), "fixture: a GVS class Nair is not assigned to");
        String subjectClass = mine.get("subjectOnly").get(0);
        String otherClass = mine.get("unassigned").get(0);
        String nair = api.teacher("9848022222", "GVS");

        JsonNode ok = api.post("/api/staff/notices", notice(List.of(subjectClass), "IMPORTANT"), nair);
        assertEquals(200, ok.get("_status").asInt(), ok.toString());
        assertEquals("IMPORTANT", ok.get("priority").asText());
        assertEquals(200, api.post("/api/staff/notices", notice(List.of(subjectClass), "NORMAL"), nair).get("_status").asInt());
        assertEquals(200, api.post("/api/staff/notices", notice(List.of("GVS-10-B"), "NORMAL"), nair).get("_status").asInt(), "his own class (class teacher)");

        assertEquals(403, api.post("/api/staff/notices", notice(List.of(otherClass), "NORMAL"), nair).get("_status").asInt(), "unassigned class");
        assertEquals(403, api.post("/api/staff/notices", notice(List.of(subjectClass, otherClass), "NORMAL"), nair).get("_status").asInt(),
                "one unassigned class refuses the whole notice");
    }

    @Test
    void anotherSchoolsClassIsNotFound() throws Exception {
        String nair = api.teacher("9848022222", "GVS");
        JsonNode cross = api.post("/api/staff/notices", notice(List.of("SJM-4-B"), "NORMAL"), nair);
        assertEquals(403, cross.get("_status").asInt(), cross.toString());
        assertTrue(cross.get("error").asText().contains("not found"), cross.toString());
        String principal = api.staff("principal@greenwoodvalley.edu.in", "Greenwood@2026", "GVS");
        assertEquals(403, api.post("/api/staff/notices", notice(List.of("SJM-4-B"), "NORMAL"), principal).get("_status").asInt(),
                "leadership cannot target another school's class either");
    }

    @Test
    void wholeSchoolAndEmergencyStayWithLeadership() throws Exception {
        String subjectClass = nairsClasses().get("subjectOnly").get(0);
        String nair = api.teacher("9848022222", "GVS");
        assertEquals(403, api.post("/api/staff/notices", notice(List.of("ALL"), "NORMAL"), nair).get("_status").asInt());
        assertEquals(403, api.post("/api/staff/notices", notice(List.of(subjectClass), "EMERGENCY"), nair).get("_status").asInt());
        assertEquals(403, api.post("/api/staff/notices", Map.of("title", "No audience", "body", "Sent to nobody?"), nair).get("_status").asInt(),
                "no audience means the whole school");

        String principal = api.staff("principal@greenwoodvalley.edu.in", "Greenwood@2026", "GVS");
        assertEquals(200, api.post("/api/staff/notices", notice(List.of("ALL"), "EMERGENCY"), principal).get("_status").asInt());
        String admin = api.staff("admin@greenwoodvalley.edu.in", "Greenwood@2026", "GVS");
        assertEquals(200, api.post("/api/staff/notices", notice(List.of(subjectClass), "IMPORTANT"), admin).get("_status").asInt());
        assertEquals(403, api.post("/api/staff/notices", notice(List.of(subjectClass), "NORMAL"), api.parent("9876543210", "GVS-2027-0001")).get("_status").asInt(),
                "parents cannot post");
    }
}
