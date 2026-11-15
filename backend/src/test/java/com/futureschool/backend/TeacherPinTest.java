package com.futureschool.backend;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.futureschool.backend.entity.AuditEvent;
import com.futureschool.backend.repository.AuditEventRepository;
import com.futureschool.backend.repository.SchoolMembershipRepository;
import com.futureschool.backend.tenant.TenantContext;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Teacher sign-in PIN (required): a teacher without one must set it right after the OTP and can
 * do nothing else until then; it is asked after every OTP; 5 wrong PINs lock it; changing it needs
 * a fresh OTP; an Admin with SECURITY resets it (reason + OTP, audited), then it must be set again.
 * Raghavan Nair (9848022222) has the demo PIN 2580; Sarah Jenkins (9848012345) starts with none.
 * A fresh context, so Sarah really has no PIN yet; every teacher ends with the demo PIN.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class TeacherPinTest {

    static final String NAIR = "9848022222";

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired SchoolMembershipRepository memberships;
    @Autowired AuditEventRepository audit;
    Api api;

    @BeforeEach
    void setUp() {
        api = new Api(mvc, json);
    }

    /** OTP verified; returns the verification (ticket + memberships). */
    private JsonNode verified(String mobile) throws Exception {
        JsonNode c = api.otp(mobile, "TEACHER_LOGIN");
        JsonNode v = api.post("/api/auth/teacher/verify", Map.of("challengeId", c.get("challengeId").asText(), "code", c.get("devCode").asText()));
        assertEquals(200, v.get("_status").asInt(), v.toString());
        return v;
    }

    private JsonNode session(JsonNode v, String pin) throws Exception {
        Map<String, String> b = new HashMap<>(Map.of("ticket", v.get("ticket").asText(), "membershipId", v.get("memberships").get(0).get("membershipId").asText()));
        if (pin != null) b.put("pin", pin);
        return api.post("/api/auth/teacher/session", b);
    }

    private String gvsSecurityAdmin() throws Exception {
        return api.staff("admin@greenwoodvalley.edu.in", "Greenwood@2026", "GVS");
    }

    @Test
    @Order(0)
    void aTeacherWithoutAPinMustSetOneBeforeAnythingElse() throws Exception {
        JsonNode v = verified("9848012345");
        assertFalse(v.get("memberships").get(0).get("requiresPin").asBoolean());
        JsonNode s = session(v, null);
        assertEquals(200, s.get("_status").asInt(), s.toString());
        String sarah = s.get("accessToken").asText();

        // Everything except the PIN screen and sign-out is refused until a PIN is set.
        MvcResult blocked = mvc.perform(get("/api/staff/assignments").header("Authorization", "Bearer " + sarah)).andReturn();
        assertEquals(403, blocked.getResponse().getStatus());
        assertTrue(blocked.getResponse().getContentAsString().contains("PIN_SETUP_REQUIRED"));
        assertEquals(403, api.status("/api/classes", sarah));
        assertEquals(200, api.status("/api/auth/me", sarah));
        assertFalse(api.getJson("/api/staff/pin", sarah).get("pinSet").asBoolean());

        // The first PIN needs no second OTP, but must not be easy to guess.
        for (String weak : new String[]{"1111", "1234", "4321", "9848", "2345", "12345", "abcd"}) {
            assertEquals("WEAK_PIN", api.post("/api/staff/pin", Map.of("pin", weak), sarah).get("code").asText(), weak);
        }
        JsonNode set = api.post("/api/staff/pin", Map.of("pin", Api.DEMO_PIN), sarah);
        assertEquals(200, set.get("_status").asInt(), set.toString());
        assertEquals(200, api.status("/api/staff/assignments", sarah), "open once the PIN is set");
        TenantContext.runAs("GVS", () -> assertTrue(audit.findAll().stream().map(AuditEvent::getAction).anyMatch("TEACHER_PIN_SET"::equals)));

        // From now on the PIN is asked after the OTP. There is no way to remove it.
        assertTrue(verified("9848012345").get("memberships").get(0).get("requiresPin").asBoolean());
        assertNotEquals(200, api.post("/api/staff/pin/remove", Map.of(), sarah).get("_status").asInt());
    }

    @Test
    @Order(1)
    void pinIsAskedAfterTheOtpAndTheTicketSurvivesWhileTyping() throws Exception {

        JsonNode v = verified(NAIR);
        assertTrue(v.get("memberships").get(0).get("requiresPin").asBoolean());
        JsonNode none = session(v, null);
        assertEquals("PIN_REQUIRED", none.get("code").asText());
        JsonNode wrong = session(v, "1357");
        assertEquals("PIN_INVALID", wrong.get("code").asText());
        assertEquals(4, wrong.get("attemptsRemaining").asInt());
        assertEquals("PIN_INVALID", session(v, "12a4").get("code").asText(), "non-digits count as wrong");
        JsonNode ok = session(v, Api.DEMO_PIN);
        assertEquals(200, ok.get("_status").asInt(), ok.toString());
        List<String> methods = json.convertValue(ok.get("authMethods"), List.class);
        assertTrue(methods.containsAll(List.of("SMS_OTP", "PIN")), methods.toString());
        assertEquals(0, memberships.findById("MEM-T-0003").orElseThrow().getPinFailedAttempts(), "a right PIN clears the count");
        assertEquals("TICKET_EXPIRED", session(v, Api.DEMO_PIN).get("code").asText(), "ticket is single use after success");
    }

    @Test
    @Order(2)
    void fiveWrongPinsLockItAndOnlyASecurityAdminCanReset() throws Exception {
        // Nair trusts this device (OTP + PIN session); the Admin reset below must revoke it.
        String openSession = session(verified(NAIR), Api.DEMO_PIN).get("accessToken").asText();
        JsonNode trusted = api.post("/api/auth/teacher/device", Map.of(), openSession);
        String device = trusted.get("deviceToken").asText();
        assertEquals(200, api.post("/api/auth/teacher/pin-login", Map.of("deviceToken", device, "pin", Api.DEMO_PIN)).get("_status").asInt());

        JsonNode v = verified(NAIR);
        for (int i = 4; i >= 1; i--) assertEquals(i, session(v, "1357").get("attemptsRemaining").asInt());
        JsonNode locked = session(v, "1357");
        assertEquals("PIN_LOCKED", locked.get("code").asText());
        assertEquals(423, locked.get("_status").asInt());
        // Locked even with the right PIN and a new OTP.
        assertEquals("PIN_LOCKED", session(verified(NAIR), Api.DEMO_PIN).get("code").asText());

        String admin = gvsSecurityAdmin();
        JsonNode list = api.getJson("/api/office/teacher-pins", admin);
        JsonNode nair = null;
        for (JsonNode n : list) if (n.get("membershipId").asText().equals("MEM-T-0003")) nair = n;
        assertNotNull(nair, list.toString());
        assertTrue(nair.get("pinSet").asBoolean() && nair.get("locked").asBoolean());
        assertEquals("••••••2222", nair.get("mobile").asText());
        assertFalse(list.toString().contains("$2a") || list.toString().contains("pinHash"), "the hash never leaves the server");
        assertFalse(list.toString().contains("MEM-T-0101"), "another school's teacher is not listed");

        // Office admin without SECURITY, a teacher, and a missing OTP/reason are all refused.
        String ops = api.staff("office@greenwoodvalley.edu.in", "Greenwood@2026", "GVS");
        assertEquals(403, api.status("/api/office/teacher-pins", ops));
        assertEquals(403, api.status("/api/office/teacher-pins", api.teacher("9848012345", "GVS")));
        String url = "/api/office/teacher-pins/MEM-T-0003/reset";
        assertEquals("REASON", api.post(url, Map.of("reason", "x", "stepUpToken", api.stepUp(admin, "SENSITIVE_STAFF_ACTION")), admin).get("code").asText());
        assertEquals("STEP_UP_REQUIRED", api.post(url, Map.of("reason", "Teacher forgot the PIN, called the office."), admin).get("code").asText());
        assertEquals(403, api.post("/api/office/teacher-pins/MEM-T-0101/reset",
                Map.of("reason", "Teacher forgot the PIN, called the office.", "stepUpToken", api.stepUp(admin, "SENSITIVE_STAFF_ACTION")), admin).get("_status").asInt());

        JsonNode reset = api.post(url, Map.of("reason", "Teacher forgot the PIN, called the office.", "stepUpToken", api.stepUp(admin, "SENSITIVE_STAFF_ACTION")), admin);
        assertEquals(200, reset.get("_status").asInt(), reset.toString());
        assertFalse(reset.get("pinSet").asBoolean());
        // A session that was open before the reset (it could be an intruder's) is ended: it cannot set the new PIN.
        assertEquals(401, api.status("/api/auth/me", openSession), "open sessions end on an Admin reset");
        assertEquals(401, api.post("/api/staff/pin", Map.of("pin", "3197"), openSession).get("_status").asInt());
        assertEquals("DEVICE_UNKNOWN", api.post("/api/auth/teacher/pin-login", Map.of("deviceToken", device, "pin", Api.DEMO_PIN)).get("code").asText(),
                "an Admin reset revokes the teacher's trusted devices");
        TenantContext.runAs("GVS", () -> assertTrue(audit.findAll().stream().map(AuditEvent::getAction).anyMatch("TEACHER_PIN_RESET"::equals)));
        // The Admin audit log (REPORTS) shows it, with the reason; another role cannot read it.
        JsonNode log = api.getJson("/api/governance/audit", admin);
        JsonNode first = log.get(0);
        assertEquals("TEACHER_PIN_RESET", first.get("action").asText(), log.toString());
        assertEquals("Teacher forgot the PIN, called the office.", first.get("reason").asText());
        assertEquals(403, api.status("/api/governance/audit", api.staff("principal@greenwoodvalley.edu.in", "Greenwood@2026", "GVS")));

        // After the reset the OTP opens a session that can only set a new PIN.
        JsonNode after = verified(NAIR);
        assertFalse(after.get("memberships").get(0).get("requiresPin").asBoolean());
        String fresh = session(after, null).get("accessToken").asText();
        assertEquals(403, api.status("/api/staff/assignments", fresh));
        assertEquals(200, api.post("/api/staff/pin", Map.of("pin", Api.DEMO_PIN), fresh).get("_status").asInt());
        assertEquals(200, api.status("/api/staff/assignments", fresh));
    }

    @Test
    @Order(3)
    void changingThePinNeedsAFreshOtp() throws Exception {
        String nair = api.teacher(NAIR, "GVS");
        assertTrue(api.getJson("/api/staff/pin", nair).get("pinSet").asBoolean());
        assertEquals("WEAK_PIN", api.post("/api/staff/pin", Map.of("pin", "2222", "stepUpToken", "x"), nair).get("code").asText());
        assertEquals("STEP_UP_REQUIRED", api.post("/api/staff/pin", Map.of("pin", "7395"), nair).get("code").asText());
        JsonNode set = api.post("/api/staff/pin", Map.of("pin", "7395", "stepUpToken", api.stepUp(nair, "SENSITIVE_STAFF_ACTION")), nair);
        assertEquals(200, set.get("_status").asInt(), set.toString());
        assertTrue(memberships.findById("MEM-T-0003").orElseThrow().getPinHash().startsWith("$2"), "stored as a BCrypt hash");

        JsonNode v = verified(NAIR);
        assertEquals("PIN_INVALID", session(v, Api.DEMO_PIN).get("code").asText(), "the old PIN no longer works");
        assertEquals(200, session(v, "7395").get("_status").asInt());

        // Only teachers have a PIN.
        assertEquals("FORBIDDEN", api.post("/api/staff/pin", Map.of("pin", "7395", "stepUpToken", "x"), gvsSecurityAdmin()).get("code").asText());
        assertEquals(403, api.status("/api/staff/pin", api.parent("9876543210", "GVS-2027-0001")));

        // Put the demo PIN back for the rest of the suite.
        assertEquals(200, api.post("/api/staff/pin", Map.of("pin", Api.DEMO_PIN, "stepUpToken", api.stepUp(nair, "SENSITIVE_STAFF_ACTION")), nair).get("_status").asInt());
    }

    @Test
    @Order(4)
    void weakPinRules() {
        assertNull(com.futureschool.backend.office.TeacherPinService.weakness("2580", "9848022222"));
        assertNotNull(com.futureschool.backend.office.TeacherPinService.weakness("0123", null));
        assertNotNull(com.futureschool.backend.office.TeacherPinService.weakness("2222", "9848022222"));
    }
}
