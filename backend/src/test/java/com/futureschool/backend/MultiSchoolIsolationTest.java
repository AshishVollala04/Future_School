package com.futureschool.backend;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.futureschool.backend.entity.SchoolClass;
import com.futureschool.backend.entity.SchoolMembership;
import com.futureschool.backend.entity.Student;
import com.futureschool.backend.entity.UserRole;
import com.futureschool.backend.repository.SchoolClassRepository;
import com.futureschool.backend.repository.SchoolMembershipRepository;
import com.futureschool.backend.repository.StudentRepository;
import com.futureschool.backend.tenant.TenantContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

/**
 * The school boundary and access rules, end to end (HTTP -> filter -> Hibernate).
 * Seed = frontend prototype people: GVS (Aarav, Ananya, Kavya), SJM (Rohan).
 * A teacher teaches in one school: Sarah Jenkins (9848012345) at GVS, J. Mary (9848033333) at SJM.
 * Rajesh (9876543210) is a parent with children in both schools.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class MultiSchoolIsolationTest {

    static final String PRINCIPAL = "principal@greenwoodvalley.edu.in";
    static final String ADMIN = "admin@greenwoodvalley.edu.in";
    static final String PWD = "Greenwood@2026";

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired StudentRepository students;
    @Autowired SchoolClassRepository classes;
    @Autowired SchoolMembershipRepository memberships;
    @Autowired TransactionTemplate tx;
    Api api;

    @BeforeEach
    void setUp() {
        api = new Api(mvc, json);
    }

    @AfterEach
    void clear() {
        TenantContext.clear();
    }

    private List<String> ids(JsonNode arr) {
        List<String> out = new ArrayList<>();
        arr.forEach(n -> out.add(n.get("id").asText()));
        return out;
    }

    @Test
    void staffSeeOnlyTheirOwnSchool() throws Exception {
        String gvsAdmin = api.staff(ADMIN, PWD, "GVS");
        List<String> gvsStudents = ids(api.getJson("/api/students", gvsAdmin));
        assertTrue(gvsStudents.contains("GVS-2027-0001"));
        assertFalse(gvsStudents.contains("SJM-2033-0105"), "SJM student leaked into GVS");
        assertEquals(403, api.status("/api/students/SJM-2033-0105", gvsAdmin));

        List<String> sjmClasses = ids(api.getJson("/api/classes", api.teacher("9848033333", "SJM")));
        assertTrue(sjmClasses.contains("SJM-4-B"));
        assertTrue(sjmClasses.stream().allMatch(c -> c.startsWith("SJM-")), "GVS class leaked into SJM: " + sjmClasses);
        assertFalse(ids(api.getJson("/api/classes", api.teacher("9848012345", "GVS"))).contains("SJM-4-B"));
    }

    @Test
    void parentSessionIsForOneChildInOneSchool() throws Exception {
        String aarav = api.parent("9876543210", "GVS-2027-0001");
        assertEquals(200, api.status("/api/students/GVS-2027-0001", aarav));
        // Ananya: same parent, same school, but a different child -> needs a child switch.
        assertEquals(403, api.status("/api/students/GVS-2031-0042", aarav));
        // Rohan: same parent, other school -> invisible.
        assertEquals(403, api.status("/api/students/SJM-2033-0105", aarav));
        assertEquals(403, api.status("/api/students", aarav));
        assertEquals(403, api.status("/api/fees/transactions", aarav));

        MvcResult r = mvc.perform(post("/api/students/by-ids").header("Authorization", "Bearer " + aarav)
                .contentType(MediaType.APPLICATION_JSON).content("[\"GVS-2027-0001\",\"GVS-2031-0042\",\"SJM-2033-0105\"]")).andReturn();
        assertEquals(List.of("GVS-2027-0001"), ids(json.readTree(r.getResponse().getContentAsString())));

        // Switch to Rohan: new session in SJM, old token stops working.
        JsonNode sw = api.post("/api/auth/parent/switch", Map.of("studentId", "SJM-2033-0105"), aarav);
        assertEquals(200, sw.get("_status").asInt(), sw.toString());
        assertEquals("SJM", sw.get("schoolId").asText());
        String rohan = sw.get("accessToken").asText();
        assertEquals(200, api.status("/api/students/SJM-2033-0105", rohan));
        assertEquals(403, api.status("/api/students/GVS-2027-0001", rohan));
        assertEquals(401, api.status("/api/auth/me", aarav));
    }

    @Test
    void repositoryLoadsAreSchoolFiltered() {
        TenantContext.runAs("GVS", () -> tx.executeWithoutResult(s -> {
            assertTrue(students.findById("GVS-2027-0001").isPresent());
            assertTrue(students.findById("SJM-2033-0105").isEmpty(), "findById crossed schools");
            assertFalse(students.existsById("SJM-2033-0105"));
            assertTrue(students.findAllById(List.of("SJM-2033-0105", "GVS-2027-0001")).stream().allMatch(st -> "GVS".equals(st.getSchoolId())));
        }));
    }

    @Test
    void cannotOverwriteAnotherSchoolsRowByGuessingItsId() {
        Student forged = Student.builder().id("SJM-2033-0105").admissionNumber("X").name("Overwritten").classId("GVS-10-A")
                .className("Class 10").section("A").roll("99").build();
        assertThrows(Exception.class, () -> TenantContext.runAs("GVS", () -> tx.executeWithoutResult(s -> students.saveAndFlush(forged))));
        TenantContext.runAs("SJM", () -> tx.executeWithoutResult(s ->
                assertEquals("Rohan Sharma", students.findById("SJM-2033-0105").orElseThrow().getName())));
    }

    @Test
    void noSchoolInContextReadsNothingAndWritesNothing() {
        tx.executeWithoutResult(s -> assertTrue(students.findAll().isEmpty()));
        Student stray = Student.builder().id("X-1").admissionNumber("X-1").name("Stray").classId("c").className("c").section("A").roll("1").build();
        assertThrows(Exception.class, () -> tx.executeWithoutResult(s -> students.saveAndFlush(stray)));
    }

    @Test
    void uniqueKeysArePerSchool() {
        TenantContext.runAs("SJM", () -> tx.executeWithoutResult(s ->
                classes.saveAndFlush(SchoolClass.builder().id("SJM-10-A").name("Class 10").section("A").gradeNumber(10).schoolLevel("Senior").active(true).build())));
        TenantContext.runAs("SJM", () -> tx.executeWithoutResult(s -> assertTrue(classes.findById("SJM-10-A").isPresent())));
    }

    @Test
    void accountEndpointsAreNotPublic() throws Exception {
        assertEquals(401, api.post("/api/auth/register", Map.of("loginId", "HACK", "name", "x", "role", "ADMIN", "password", "password123")).get("_status").asInt());
        assertEquals(401, mvc.perform(get("/api/auth/users")).andReturn().getResponse().getStatus());
        assertEquals(401, mvc.perform(post("/api/auth/users/ACC-L-0002/reset-password")).andReturn().getResponse().getStatus());
        assertEquals(403, api.status("/api/auth/users", api.teacher("9848012345", "GVS")));
    }

    @Test
    void adminListsOnlyPeopleOfTheirSchool() throws Exception {
        JsonNode users = api.getJson("/api/auth/users", api.staff(ADMIN, PWD, "GVS"));
        List<String> logins = new ArrayList<>();
        users.forEach(u -> logins.add(u.get("loginId").asText()));
        assertTrue(logins.contains("ACC-L-0001"));
        assertFalse(logins.contains("ACC-L-0004"), "SJM principal listed for GVS admin");
    }

    @Test
    void destructiveAndRankingEndpointsAreClosed() throws Exception {
        String admin = api.staff(ADMIN, PWD, "GVS");
        assertEquals(403, mvc.perform(delete("/api/students/GVS-2027-0001").header("Authorization", "Bearer " + admin)).andReturn().getResponse().getStatus());
        assertEquals(403, api.status("/api/analytics/leaderboard", admin));
        assertEquals(403, api.status("/api/some/unknown/route", admin));
    }

    @Test
    void principalCannotPublishMarks() throws Exception {
        String principal = api.staff(PRINCIPAL, PWD, "GVS");
        int s = mvc.perform(put("/api/marks/publish").header("Authorization", "Bearer " + principal).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andReturn().getResponse().getStatus();
        assertEquals(403, s);
    }

    @Test
    void keepsTwoActiveAdminsAndNeverResetsAnotherSchoolsPerson() throws Exception {
        String admin = api.staff(ADMIN, PWD, "GVS");
        MvcResult r = mvc.perform(put("/api/auth/users/ACC-L-0003/toggle-status").header("Authorization", "Bearer " + admin)).andReturn();
        assertEquals(400, r.getResponse().getStatus());
        assertTrue(r.getResponse().getContentAsString().contains("at least two active Admins"));
        // Rajesh also belongs to SJM (a parent there), so a GVS Admin must not reset his password.
        MvcResult reset = mvc.perform(post("/api/auth/users/GRD-0001/reset-password").header("Authorization", "Bearer " + admin)).andReturn();
        assertEquals(400, reset.getResponse().getStatus());
    }

    @Test
    void aTeacherBelongsToOnlyOneSchool() throws Exception {
        String admin = api.staff(ADMIN, PWD, "GVS");
        // Teacher sign-in offers exactly one school.
        JsonNode c = api.otp("9848012345", "TEACHER_LOGIN");
        JsonNode v = api.post("/api/auth/teacher/verify", Map.of("challengeId", c.get("challengeId").asText(), "code", c.get("devCode").asText()));
        assertEquals(1, v.get("memberships").size(), v.toString());
        assertEquals("GVS", v.get("memberships").get(0).get("schoolId").asText());

        // GVS cannot register J. Mary's mobile as a teacher: she already teaches at SJM.
        MvcResult reg = mvc.perform(post("/api/auth/register").header("Authorization", "Bearer " + admin).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("loginId", "mary.gvs", "name", "J. Mary", "mobile", "9848033333", "role", "TEACHER",
                        "password", "Teacher@2026x", "title", "Subject Teacher")))).andReturn();
        assertEquals(400, reg.getResponse().getStatus());
        assertTrue(reg.getResponse().getContentAsString().contains("only one school"), reg.getResponse().getContentAsString());
        // The same rule on the Teachers screen: a friendly refusal, not a database error.
        MvcResult viaTeachers = mvc.perform(post("/api/teachers").header("Authorization", "Bearer " + admin).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("teacherId", "STF-T-0101", "name", "J. Mary", "designation", "Subject Teacher")))).andReturn();
        assertEquals(400, viaTeachers.getResponse().getStatus());
        assertTrue(viaTeachers.getResponse().getContentAsString().contains("only one school"), viaTeachers.getResponse().getContentAsString());
        assertEquals(1, memberships.findByAccountIdAndActiveTrue("STF-T-0101").stream().filter(x -> x.getRole() == UserRole.TEACHER).count(),
                "nothing was added in GVS");

        // An old, suspended GVS membership cannot be reactivated while she is active at SJM.
        memberships.save(SchoolMembership.builder().id("MEM-T-TEST").accountId("STF-T-0101").schoolId("GVS").role(UserRole.TEACHER)
                .title("Former teacher").active(false).build());
        try {
            MvcResult r = mvc.perform(put("/api/auth/users/STF-T-0101/toggle-status").header("Authorization", "Bearer " + admin)).andReturn();
            assertEquals(400, r.getResponse().getStatus());
            assertTrue(r.getResponse().getContentAsString().contains("only one school"), r.getResponse().getContentAsString());
            assertFalse(memberships.findById("MEM-T-TEST").orElseThrow().isActive());
        } finally {
            memberships.deleteById("MEM-T-TEST");
        }
    }

    @Test
    void suspendedMembershipStopsWorkingImmediately() throws Exception {
        String principal = api.staff("principal@stjudemodel.edu.in", "StJude@2026", "SJM");
        assertEquals(200, api.status("/api/auth/me", principal));
        SchoolMembership m = memberships.findById("MEM-L-0004").orElseThrow();
        m.setActive(false);
        memberships.save(m);
        try {
            assertEquals(401, api.status("/api/auth/me", principal));
        } finally {
            m.setActive(true);
            memberships.save(m);
        }
    }

    @Test
    void apiDocsLoadOnThisSpringVersion() throws Exception {
        assertEquals(200, mvc.perform(get("/v3/api-docs")).andReturn().getResponse().getStatus());
    }
}
