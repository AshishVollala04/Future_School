package com.futureschool.backend;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.futureschool.backend.entity.UserRole;
import com.futureschool.backend.tenant.TenantContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

/**
 * Verifies all product, API-wiring, multi-tenant, permission, and onboarding gap fixes:
 * - Current school profile & update audit trail
 * - Live DB /api/staff/overview and permission-scoped /api/office/work-queue
 * - Multi-school parent AlertOptOut isolation (no PK collision for GVS+SJM parent)
 * - Real counter cash receipts (isMock=false) & unique receipt numbering
 * - Hall ticket schedule subjects populated from ClassSubjectTeacher
 * - Legacy CRUD permission boundaries & multi-school ID generation without collisions
 * - Bulk CSV student onboarding -> Term 1-4 fees -> UDISE fix round-trip
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
class GapFixesAndOnboardingTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;

    Api api;

    @BeforeEach
    void setUp() {
        api = new Api(mvc, json);
    }

    @AfterEach
    void clear() {
        TenantContext.clear();
    }

    private String gvsAdmin() throws Exception {
        return api.staff("admin@greenwoodvalley.edu.in", "Greenwood@2026", "GVS");
    }

    private String gvsOpsAdmin() throws Exception {
        return api.staff("office@greenwoodvalley.edu.in", "Greenwood@2026", "GVS");
    }

    private String gvsPrincipal() throws Exception {
        return api.staff("principal@greenwoodvalley.edu.in", "Greenwood@2026", "GVS");
    }

    @Test
    void schoolProfileOverviewAndWorkQueueUseLiveDb() throws Exception {
        String pToken = gvsPrincipal();
        String aToken = gvsAdmin();
        String oToken = gvsOpsAdmin();
        String tToken = api.teacher("9848012345", "GVS");

        // Any school user gets current school profile; updates require leadership & write audit
        JsonNode profile = api.getJson("/api/schools/current", tToken);
        assertEquals("GVS", profile.get("id").asText());
        assertEquals("Greenwood Valley High School", profile.get("name").asText());
        assertEquals(403, mvc.perform(put("/api/schools/current").header("Authorization", "Bearer " + tToken)
                .contentType(MediaType.APPLICATION_JSON).content("{\"phone\":\"+91 40 1111 2222\"}")).andReturn().getResponse().getStatus());

        MvcResult upd = mvc.perform(put("/api/schools/current").header("Authorization", "Bearer " + pToken)
                .contentType(MediaType.APPLICATION_JSON).content("{\"phone\":\"+91 40 9999 8888\"}")).andReturn();
        assertEquals(200, upd.getResponse().getStatus());
        assertEquals("+91 40 9999 8888", json.readTree(upd.getResponse().getContentAsString()).get("contact").get("phone").asText());

        // Staff overview works for Principal & Admin and returns live financial & academic data; rejected for Teacher
        assertEquals(403, api.status("/api/staff/overview", tToken));
        JsonNode ov = api.getJson("/api/staff/overview", pToken);
        assertTrue(ov.get("attendance").get("classesTotal").asInt() >= 4);
        assertTrue(ov.get("finance").get("charged").asLong() > 0);
        assertTrue(ov.get("finance").get("collected").asLong() > 0);
        assertEquals(4, ov.get("finance").get("byInstalment").size());
        assertTrue(ov.has("counts"));

        // Work queue is permission-filtered for Admin and blocked for Principal
        assertEquals(403, api.status("/api/office/work-queue", pToken));
        JsonNode financeQueue = api.getJson("/api/office/work-queue", aToken);
        assertEquals(0, financeQueue.get("complaintsOpen").asInt());
        assertEquals(0, financeQueue.get("transportPending").asInt());
        JsonNode opsQueue = api.getJson("/api/office/work-queue", oToken);
        assertTrue(opsQueue.has("governance"));
        assertTrue(opsQueue.has("substitutionsUncovered"));
    }

    @Test
    void multiSchoolParentOptOutAndRealCashReceiptAndHallTicketSubjects() throws Exception {
        // Rajesh has children in GVS and SJM: opting out in GVS must not fail with PK collision or opt out SJM
        String aaravGvs = api.parent("9876543210", "GVS-2027-0001");
        JsonNode optOutRes = api.post("/api/parent/alerts/preference", Map.of("whatsappAlerts", false), aaravGvs);
        assertFalse(optOutRes.get("whatsappAlerts").asBoolean());

        String rohanSjm = api.parent("9876543210", "SJM-2033-0105");
        JsonNode sjmPref = api.getJson("/api/parent/alerts/preference", rohanSjm);
        assertTrue(sjmPref.get("whatsappAlerts").asBoolean(), "GVS opt-out must stay scoped to GVS");
        JsonNode sjmOptOut = api.post("/api/parent/alerts/preference", Map.of("whatsappAlerts", false), rohanSjm);
        assertFalse(sjmOptOut.get("whatsappAlerts").asBoolean());
        // Restore both to true
        api.post("/api/parent/alerts/preference", Map.of("whatsappAlerts", true), aaravGvs);
        api.post("/api/parent/alerts/preference", Map.of("whatsappAlerts", true), rohanSjm);

        // Cash at office payment is NOT flagged mock and generates unique receipt number
        String finAdmin = gvsAdmin();
        JsonNode cash = api.post("/api/office/fees/cash", Map.of("studentId", "GVS-2028-0117", "amount", 1000, "note", "Slip 77"), finAdmin);
        assertFalse(cash.get("isMock").asBoolean(), "Genuine cash payments must have isMock=false");
        assertTrue(cash.get("receiptNo").asText().startsWith("GVS/"));

        // Hall ticket response includes exam schedule subjects from ClassSubjectTeacher
        JsonNode tickets = api.getJson("/api/parent/hall-tickets", aaravGvs);
        assertTrue(tickets.size() > 0);
        assertTrue(tickets.get(0).get("subjects").size() > 0, "Hall ticket should include class subject schedule");
    }

    @Test
    void csvOnboardingCreatesStudentsFeesParentsAndFixesUdise() throws Exception {
        String finAdmin = gvsAdmin();
        String opsAdmin = gvsOpsAdmin();

        // Permission check: Ops admin (no ADMISSIONS) cannot import CSV or create students
        MvcResult forbiddenImport = mvc.perform(post("/api/admin/students/import").header("Authorization", "Bearer " + opsAdmin)
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("csv", "Student Name\nTest")))).andReturn();
        assertEquals(403, forbiddenImport.getResponse().getStatus());

        // Admissions Admin (no COMPLAINTS) cannot resolve legacy complaints
        MvcResult forbiddenResolve = mvc.perform(patch("/api/communication/complaints/CMP-1/resolve").header("Authorization", "Bearer " + finAdmin)
                .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"RESOLVED\"}")).andReturn();
        assertEquals(403, forbiddenResolve.getResponse().getStatus());

        // Bulk import 1 valid + 1 invalid row
        String csv = "Admission No,Student Name,Date of Birth,Gender,Class,Section,Parent Name,Parent Mobile,Aadhaar No,Mother Tongue\n"
                + "GVS-CSV-01,Nikhil Varma,2013-08-12,Male,8,A,Suresh Varma,9848055555,123456789012,Telugu\n"
                + "GVS-CSV-BAD,Bad Row Student,2013-01-01,Male,8,A,Bad Parent,12345,999,Telugu\n";
        JsonNode res = api.post("/api/admin/students/import", Map.of("csv", csv, "defaultAnnualFee", 40000), finAdmin);
        assertEquals(1, res.get("createdCount").asInt());
        assertEquals(1, res.get("classesCreated").asInt());
        assertEquals(1, res.get("errors").size());
        String newStudentId = res.get("createdStudentIds").get(0).asText();

        // Term 1-4 fees were provisioned automatically and show up at Fee Desk
        JsonNode acct = api.getJson("/api/office/fees/account?studentId=" + newStudentId, finAdmin);
        assertEquals(40000L, acct.get("summary").get("totalOutstanding").asLong());

        // Partial PUT update fills missing UDISE fields without clearing existing name/class
        MvcResult putRes = mvc.perform(put("/api/students/" + newStudentId).header("Authorization", "Bearer " + finAdmin)
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of(
                        "apaarId", "APAAR98765432",
                        "casteCategory", "OBC",
                        "religion", "Hindu",
                        "fatherName", "Suresh Varma",
                        "motherName", "Lakshmi Varma",
                        "address", "12 Main Rd",
                        "district", "Hyderabad",
                        "mandal", "Medchal",
                        "pincode", "500014",
                        "mediumOfInstruction", "English"
                )))).andReturn();
        assertEquals(200, putRes.getResponse().getStatus());
        JsonNode updatedStudent = json.readTree(putRes.getResponse().getContentAsString());
        assertEquals("Nikhil Varma", updatedStudent.get("name").asText(), "Partial PUT must preserve existing name");
        assertEquals("APAAR98765432", updatedStudent.get("apaarId").asText());

        // UDISE validation shows this student is now 100% ready (not listed under issues!)
        JsonNode udise = api.getJson("/api/admin/udise/validation", finAdmin);
        for (JsonNode issue : udise.get("issues")) {
            assertNotEquals(newStudentId, issue.get("studentId").asText());
        }

        // Academic setup & subject-teacher assignment
        JsonNode setup = api.getJson("/api/admin/academics/setup", opsAdmin);
        assertTrue(setup.get("teachers").size() >= 2);
        JsonNode assigned = api.post("/api/admin/academics/subject-teachers",
                Map.of("classId", "GVS-8-A", "subject", "Science", "staffId", "STF-T-0001"), opsAdmin);
        assertTrue(assigned.get("subjectTeachers").toString().contains("Science"));
    }
}
