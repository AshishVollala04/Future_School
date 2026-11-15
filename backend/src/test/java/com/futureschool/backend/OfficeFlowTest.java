package com.futureschool.backend;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/** Complaints (Flow 5), transport (Flow 4), one-time pickup passes and staff access on the backend. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class OfficeFlowTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    Api api;

    @BeforeEach
    void setUp() {
        api = new Api(mvc, json);
    }

    static String day(int n) {
        return LocalDate.now(ZoneId.of("Asia/Kolkata")).plusDays(n).toString();
    }

    private String ops() throws Exception {
        return api.staff("office@greenwoodvalley.edu.in", "Greenwood@2026", "GVS");
    }

    private String finance() throws Exception {
        return api.staff("admin@greenwoodvalley.edu.in", "Greenwood@2026", "GVS");
    }

    private String stepUp(String token, String purpose) throws Exception {
        JsonNode c = api.post("/api/auth/step-up/request", Map.of("purpose", purpose), token);
        return api.post("/api/auth/step-up/verify", Map.of("challengeId", c.get("challengeId").asText(), "code", c.get("devCode").asText()), token)
                .get("stepUpToken").asText();
    }

    @Test
    @Order(1)
    void complaintsFromParentToAdminAndBack() throws Exception {
        String kavya = api.parent("9848011111", "GVS-2028-0117");
        JsonNode c = api.post("/api/parent/complaints", Map.of("category", "SAFETY", "subject", "Broken railing", "description", "The stair railing near 9-A is loose and unsafe."), kavya);
        assertTrue(c.get("principalInformed").asBoolean(), c.toString());
        assertEquals(403, api.status("/api/staff/complaints", finance()), "needs COMPLAINTS");
        JsonNode principalView = api.getJson("/api/staff/complaints", api.staff("principal@greenwoodvalley.edu.in", "Greenwood@2026", "GVS"));
        assertEquals(1, principalView.size(), "the Principal sees safety complaints only");
        String ops = ops();
        assertEquals(2, api.getJson("/api/staff/complaints", ops).size());
        String id = c.get("id").asText();
        assertEquals("STATE", api.post("/api/parent/complaints/" + id + "/confirm", Map.of(), kavya).get("code").asText());
        assertEquals("NOTE", api.post("/api/staff/complaints/" + id + "/respond", Map.of("note", "ok", "status", "RESOLVED"), ops).get("code").asText());
        api.post("/api/staff/complaints/" + id + "/respond", Map.of("note", "Railing repaired by the maintenance team today.", "status", "RESOLVED"), ops);
        assertEquals("REOPENED", api.post("/api/parent/complaints/" + id + "/reopen", Map.of("reason", "Still loose on the second floor."), kavya).get("status").asText());
        api.post("/api/staff/complaints/" + id + "/respond", Map.of("note", "Second floor railing fixed as well.", "status", "RESOLVED"), ops);
        assertEquals("CLOSED", api.post("/api/parent/complaints/" + id + "/confirm", Map.of(), kavya).get("status").asText());
        assertEquals("STATE", api.post("/api/staff/complaints/" + id + "/respond", Map.of("note", "Another update here.", "status", "IN_PROGRESS"), ops).get("code").asText());
        assertEquals(0, api.getJson("/api/parent/complaints", api.parent("9876543210", "GVS-2031-0042")).size(), "another child's complaints stay out");
    }

    @Test
    @Order(2)
    void transportSeatsAreCheckedWhenApproving() throws Exception {
        String ops = ops();
        JsonNode reqs = api.getJson("/api/office/transport/requests", ops);
        assertEquals(0, reqs.get(0).get("toRouteSeatsLeft").asInt(), "Route 4 is full");
        assertEquals("FULL", api.post("/api/office/transport/requests/TRQ-GVS-1/decision", Map.of("decision", "APPROVED"), ops).get("code").asText());
        assertEquals("REASON", api.post("/api/office/transport/requests/TRQ-GVS-1/decision", Map.of("decision", "REJECTED", "note", ""), ops).get("code").asText());
        api.post("/api/office/transport/requests/TRQ-GVS-1/decision", Map.of("decision", "REJECTED", "note", "Route 4 is full. Route 7 has seats."), ops);
        String kavya = api.parent("9848011111", "GVS-2028-0117");
        Map<String, Object> req = new HashMap<>(Map.of("kind", "CHANGE", "toRouteId", "Route 7", "stopName", "Nowhere", "reason", "Route 4 full", "effectiveFrom", day(3)));
        assertEquals("STOP", api.post("/api/parent/transport/requests", req, kavya).get("code").asText());
        req.put("stopName", "DLF Gate");
        JsonNode r = api.post("/api/parent/transport/requests", req, kavya);
        assertEquals("NEW", r.get("kind").asText(), r.toString());
        assertEquals("PENDING_EXISTS", api.post("/api/parent/transport/requests", req, kavya).get("code").asText());
        assertEquals(403, api.post("/api/office/transport/requests/" + r.get("id").asText() + "/decision", Map.of("decision", "APPROVED"), finance()).get("_status").asInt());
        api.post("/api/office/transport/requests/" + r.get("id").asText() + "/decision", Map.of("decision", "APPROVED"), ops);
        JsonNode mine = api.getJson("/api/parent/transport", kavya);
        assertEquals("Route 7", mine.get("current").get("route").get("id").asText());
        assertEquals("DLF Gate", mine.get("current").get("stop").get("name").asText());
    }

    @Test
    @Order(3)
    void pickupPassIsOneTimeAndNeedsTheOtp() throws Exception {
        String parent = api.parent("9876543210", "GVS-2027-0001");
        JsonNode me = api.getJson("/api/parent/pickup", parent);
        List<String> names = new ArrayList<>();
        me.get("guardians").forEach(g -> names.add(g.get("name").asText()));
        assertEquals(Set.of("Rajesh Sharma", "Meena Sharma"), new HashSet<>(names), "only the linked guardians");
        Map<String, Object> pass = new HashMap<>(Map.of("personName", "Vikram Sharma", "relation", "Uncle", "mobile", "9845077112", "reason", "Parents at a hospital appointment."));
        assertEquals("STEP_UP_REQUIRED", api.post("/api/parent/pickup/passes", pass, parent).get("code").asText());
        pass.put("stepUpToken", stepUp(parent, "PAYMENT"));
        assertEquals("STEP_UP_REQUIRED", api.post("/api/parent/pickup/passes", pass, parent).get("code").asText(), "a payment OTP is not a pickup OTP");
        pass.put("stepUpToken", stepUp(parent, "PICKUP_AUTHORIZATION"));
        JsonNode issued = api.post("/api/parent/pickup/passes", pass, parent);
        String code = issued.get("code").asText();
        assertEquals(8, code.length(), issued.toString());
        assertFalse(api.getJson("/api/parent/pickup", parent).toString().contains(code), "the code is shown only once");

        JsonNode other = api.post("/api/staff/pickup/verify", Map.of("code", code), api.staff("principal@stjudemodel.edu.in", "StJude@2026", "SJM"));
        assertEquals("INVALID", other.get("code").asText(), "another school's gate cannot use it");
        String sarah = api.teacher("9848012345", "GVS");
        JsonNode ok = api.post("/api/staff/pickup/verify", Map.of("code", code.toLowerCase()), sarah);
        assertEquals("USED", ok.get("status").asText(), ok.toString());
        assertEquals("Aarav Sharma", ok.get("studentName").asText());
        assertEquals("USED", api.post("/api/staff/pickup/verify", Map.of("code", code), sarah).get("code").asText(), "used once only");
        assertEquals(403, api.post("/api/staff/pickup/verify", Map.of("code", code), parent).get("_status").asInt());

        pass.put("stepUpToken", stepUp(parent, "PICKUP_AUTHORIZATION"));
        JsonNode second = api.post("/api/parent/pickup/passes", pass, parent);
        assertEquals("CANCELLED", api.post("/api/parent/pickup/passes/" + second.get("id").asText() + "/cancel", Map.of(), parent).get("status").asText());
        assertEquals("CANCELLED", api.post("/api/staff/pickup/verify", Map.of("code", second.get("code").asText()), sarah).get("code").asText());
    }

    @Test
    @Order(4)
    void staffAccessKeepsTwoAdminsAndInvitationsNeedBothFactors() throws Exception {
        String f = finance();
        assertEquals(403, api.status("/api/office/staff", ops()), "needs SECURITY");
        assertEquals(3, api.getJson("/api/office/staff", f).size());
        assertEquals("SELF", api.post("/api/office/staff/ACC-L-0002/status", Map.of("status", "DISABLED", "reason", "testing self suspension", "stepUpToken", stepUp(f, "SENSITIVE_STAFF_ACTION")), f).get("code").asText());
        assertEquals("QUORUM", api.post("/api/office/staff/ACC-L-0003/status", Map.of("status", "DISABLED", "reason", "Leaving the school next week", "stepUpToken", stepUp(f, "SENSITIVE_STAFF_ACTION")), f).get("code").asText());
        assertEquals("EXISTS", api.post("/api/office/staff/invite", Map.of("name", "Dup", "email", "office@greenwoodvalley.edu.in", "permissions", List.of("REPORTS")), f).get("code").asText());

        JsonNode inv = api.post("/api/office/staff/invite", Map.of("name", "Kiran Rao", "email", "kiran.rao@greenwoodvalley.edu.in", "title", "Administrator · Transport",
                "permissions", List.of("TRANSPORT", "REPORTS")), f);
        String token = inv.get("token").asText();
        JsonNode view = api.getJson("/api/auth/invitations/" + token, "unused");
        assertEquals("kiran.rao@greenwoodvalley.edu.in", view.get("email").asText(), view.toString());
        assertEquals("WEAK_PASSWORD", api.post("/api/auth/invitations/" + token + "/accept", Map.of("email", "kiran.rao@greenwoodvalley.edu.in", "password", "short"), null).get("code").asText());
        assertEquals("INVITE_INVALID", api.post("/api/auth/invitations/" + token + "/accept", Map.of("email", "someone@else.in", "password", "NewAdmin2026x"), null).get("code").asText());
        // Before acceptance the account cannot sign in at all.
        assertEquals(401, api.post("/api/auth/staff/password", Map.of("email", "kiran.rao@greenwoodvalley.edu.in", "password", "NewAdmin2026x"), null).get("_status").asInt());

        JsonNode first = api.post("/api/auth/invitations/" + token + "/accept", Map.of("email", "kiran.rao@greenwoodvalley.edu.in", "password", "NewAdmin2026x"), null);
        JsonNode sf = first.get("secondFactor");
        JsonNode verified = api.post("/api/auth/staff/verify", Map.of("ticket", first.get("ticket").asText(), "challengeId", sf.get("challengeId").asText(), "code", sf.get("devCode").asText()), null);
        assertEquals(200, verified.get("_status").asInt(), verified.toString());
        assertEquals("INVITE_INVALID", api.getJson("/api/auth/invitations/" + token, "unused").get("code").asText(), "single use");
        String kiran = api.staff("kiran.rao@greenwoodvalley.edu.in", "NewAdmin2026x", "GVS");
        assertEquals(200, api.status("/api/office/transport/routes", kiran));
        assertEquals(403, api.status("/api/office/fees/students", kiran), "only the granted permissions");

        // Three active Admins now: suspending one is allowed (with OTP + reason) and it stops their sign-in.
        assertEquals("DISABLED", api.post("/api/office/staff/ACC-L-0003/status", Map.of("status", "DISABLED", "reason", "Leaving the school next week",
                "stepUpToken", stepUp(f, "SENSITIVE_STAFF_ACTION")), f).get("status").asText());
        assertEquals(401, api.post("/api/auth/staff/password", Map.of("email", "office@greenwoodvalley.edu.in", "password", "Greenwood@2026"), null).get("_status").asInt());
        assertEquals("ACTIVE", api.post("/api/office/staff/ACC-L-0003/status", Map.of("status", "ACTIVE", "reason", "Returned from leave today",
                "stepUpToken", stepUp(f, "SENSITIVE_STAFF_ACTION")), f).get("status").asText());
    }
}
