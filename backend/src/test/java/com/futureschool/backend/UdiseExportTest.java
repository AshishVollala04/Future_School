package com.futureschool.backend;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.futureschool.backend.entity.SchoolMembership;
import com.futureschool.backend.entity.Student;
import com.futureschool.backend.entity.UserRole;
import com.futureschool.backend.repository.SchoolMembershipRepository;
import com.futureschool.backend.repository.StudentRepository;
import com.futureschool.backend.tenant.TenantContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/** UDISE+ student readiness validation, CSV export, permissions, and tenant isolation. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
class UdiseExportTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired StudentRepository students;
    @Autowired SchoolMembershipRepository memberships;

    Api api;

    @BeforeEach
    void setUp() {
        api = new Api(mvc, json);
    }

    private String admin() throws Exception {
        return api.staff("admin@greenwoodvalley.edu.in", "Greenwood@2026", "GVS");
    }

    private String principal() throws Exception {
        return api.staff("principal@greenwoodvalley.edu.in", "Greenwood@2026", "GVS");
    }

    private String teacher() throws Exception {
        return api.teacher("9848012345", "GVS");
    }

    @Test
    void enforcesPermissionsAndTenantIsolation() throws Exception {
        String teacherToken = teacher();
        assertEquals(403, api.status("/api/admin/udise/validation", teacherToken));
        assertEquals(403, api.status("/api/admin/udise/export.csv", teacherToken));

        String adminToken = admin();
        JsonNode report = api.getJson("/api/admin/udise/validation", adminToken);
        assertEquals("GVS", report.get("schoolId").asText());
        assertTrue(report.get("totalStudents").asInt() > 0);

        // Tenant isolation: SJM students must never appear in GVS validation issues or CSV
        for (JsonNode issue : report.get("issues")) {
            assertFalse(issue.get("studentId").asText().startsWith("SJM-"), issue.toString());
        }

        // Principal can view UDISE validation as leadership
        String principalToken = principal();
        JsonNode pReport = api.getJson("/api/admin/udise/validation", principalToken);
        assertEquals("GVS", pReport.get("schoolId").asText());

        // Admin without REPORTS permission is rejected
        List<SchoolMembership> gvsAdmins = TenantContext.callAs("GVS", () -> memberships.findBySchoolIdAndRole("GVS", UserRole.ADMIN));
        assertFalse(gvsAdmins.isEmpty());
        java.util.Map<String, String> originalPerms = new java.util.HashMap<>();
        for (SchoolMembership m : gvsAdmins) originalPerms.put(m.getId(), m.getPermissions());
        try {
            TenantContext.runAs("GVS", () -> {
                for (SchoolMembership m : gvsAdmins) {
                    m.setPermissions("FINANCE,ADMISSIONS");
                    memberships.save(m);
                }
            });
            assertEquals(403, api.status("/api/admin/udise/validation", adminToken));
            assertEquals(403, api.status("/api/admin/udise/export.csv", adminToken));
        } finally {
            TenantContext.runAs("GVS", () -> {
                for (SchoolMembership m : gvsAdmins) {
                    m.setPermissions(originalPerms.get(m.getId()));
                    memberships.save(m);
                }
            });
        }
    }

    @Test
    void validatesMissingFieldsExportsEscapedCsvAndAuditsSafely() throws Exception {
        // Prepare one completely valid student and one incomplete student in GVS
        TenantContext.runAs("GVS", () -> {
            Student ready = students.findById("GVS-2027-0001").orElseThrow();
            ready.setDob("2011-06-15");
            ready.setGender("Male");
            ready.setAadhaarNumber("234567890123");
            ready.setApaarId("123456789012");
            ready.setCasteCategory("OBC");
            ready.setReligion("Hindu");
            ready.setMotherTongue("Telugu");
            ready.setFatherName("Rajesh Kumar");
            ready.setMotherName("Lakshmi Kumar");
            ready.setParentMobile("9848011122");
            ready.setAddress("12-3, Banjara Hills");
            ready.setDistrict("Hyderabad");
            ready.setMandal("Khairatabad");
            ready.setPincode("500034");
            ready.setMediumOfInstruction("English");
            students.save(ready);

            Student incomplete = students.findById("GVS-2027-0002").orElseThrow();
            incomplete.setAadhaarNumber("999"); // invalid 12-digit length
            incomplete.setApaarId(null);
            incomplete.setMotherTongue("");
            incomplete.setDistrict(null);
            incomplete.setAddress("=CMD|'/C calc'!A0, Street 2"); // formula injection attempt
            students.save(incomplete);
        });

        String token = admin();
        JsonNode report = api.getJson("/api/admin/udise/validation?classId=GVS-10-A", token);
        assertTrue(report.get("totalStudents").asInt() >= 2);
        assertTrue(report.get("readyCount").asInt() >= 1);
        assertTrue(report.get("incompleteCount").asInt() >= 1);

        JsonNode missingTwo = null;
        for (JsonNode row : report.get("issues")) {
            if ("GVS-2027-0002".equals(row.get("studentId").asText())) {
                missingTwo = row;
                break;
            }
        }
        assertNotNull(missingTwo, report.toString());
        String missingText = missingTwo.get("missingFields").toString();
        assertTrue(missingText.contains("Aadhaar number (12 digits)"), missingText);
        assertTrue(missingText.contains("APAAR ID"), missingText);
        assertTrue(missingText.contains("Mother tongue"), missingText);
        assertTrue(missingText.contains("District"), missingText);

        // Full CSV export includes incomplete rows and escapes formula prefix
        MvcResult fullRes = mvc.perform(get("/api/admin/udise/export.csv?classId=GVS-10-A")
                        .header("Authorization", "Bearer " + token))
                .andReturn();
        assertEquals(200, fullRes.getResponse().getStatus());
        String disp = fullRes.getResponse().getHeader("Content-Disposition");
        assertNotNull(disp);
        assertTrue(disp.contains("udise-students-gvs.csv"), disp);

        byte[] rawBytes = fullRes.getResponse().getContentAsByteArray();
        assertTrue(rawBytes.length > 3);
        assertEquals((byte) 0xEF, rawBytes[0]);
        assertEquals((byte) 0xBB, rawBytes[1]);
        assertEquals((byte) 0xBF, rawBytes[2]);

        String csv = new String(rawBytes, StandardCharsets.UTF_8);
        assertTrue(csv.contains("Admission No,Student Name,Date of Birth,Gender,Class,Section"));
        assertTrue(csv.contains("234567890123"));
        assertTrue(csv.contains("\"'=CMD|'/C calc'!A0, Street 2\""), csv);
        assertFalse(csv.contains("SJM-"));

        // onlyValid=true skips incomplete rows
        MvcResult validOnlyRes = mvc.perform(get("/api/admin/udise/export.csv?classId=GVS-10-A&onlyValid=true")
                        .header("Authorization", "Bearer " + token))
                .andReturn();
        assertEquals(200, validOnlyRes.getResponse().getStatus());
        int skipped = Integer.parseInt(validOnlyRes.getResponse().getHeader("X-Udise-Skipped-Count"));
        assertTrue(skipped >= 1);
        String validCsv = validOnlyRes.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertTrue(validCsv.contains("234567890123"));
        assertFalse(validCsv.contains("'=CMD"));

        // Audit log records UDISE_EXPORT without raw Aadhaar numbers
        JsonNode audit = api.getJson("/api/governance/audit", token);
        boolean foundAudit = false;
        for (JsonNode ev : audit) {
            if ("UDISE_EXPORT".equals(ev.get("action").asText())) {
                foundAudit = true;
                assertFalse(ev.get("details").asText().contains("234567890123"));
                break;
            }
        }
        assertTrue(foundAudit, audit.toString());
    }
}
