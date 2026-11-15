package com.futureschool.backend;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.futureschool.backend.repository.OtpChallengeRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** OTP sign-in rules: parent, teacher, Principal/Admin second factor, tickets, sessions, step-up. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SignInFlowTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired OtpChallengeRepository challenges;
    Api api;

    @BeforeEach
    void setUp() {
        api = new Api(mvc, json);
    }

    private JsonNode verifyParent(JsonNode challenge, String code) throws Exception {
        return api.post("/api/auth/parent/verify", Map.of("challengeId", challenge.get("challengeId").asText(), "code", code));
    }

    @Test
    void parentSeesAllLinkedChildrenAcrossSchoolsAndProfileMatchesFrontend() throws Exception {
        JsonNode c = api.otp("+91 98765 43210", "PARENT_LOGIN");
        assertEquals("SMS", c.get("channel").asText());
        assertEquals("+91 ••••••3210", c.get("maskedDestination").asText());
        assertFalse(c.has("codeHash"));
        JsonNode v = verifyParent(c, c.get("devCode").asText());
        assertEquals("Rajesh Sharma", v.get("guardianName").asText());
        assertEquals(3, v.get("children").size());
        // Other tests in this run may already have given Rajesh the demo PIN.
        Map<String, String> body = new java.util.HashMap<>(Map.of("ticket", v.get("ticket").asText(), "studentId", "SJM-2033-0105"));
        if (v.get("requiresPin").asBoolean()) body.put("pin", Api.DEMO_PIN);
        JsonNode s = api.post("/api/auth/parent/session", body);
        assertEquals("GRD-0001", s.get("userId").asText(), s.toString());
        assertEquals("SJM", s.get("schoolId").asText());
        assertEquals("SJM-2033-0105", s.get("studentId").asText());
        assertEquals("Rohan Sharma", s.get("profile").get("studentName").asText());
        assertEquals(3, s.get("profile").get("linkedChildren").size());
        // Ticket is single-use.
        assertEquals(401, api.post("/api/auth/parent/session", Map.of("ticket", v.get("ticket").asText(), "studentId", "GVS-2027-0001")).get("_status").asInt());
    }

    @Test
    void parentCannotOpenASessionForSomeoneElsesChild() throws Exception {
        JsonNode c = api.otp("9848011111", "PARENT_LOGIN");
        JsonNode v = verifyParent(c, c.get("devCode").asText());
        JsonNode s = api.post("/api/auth/parent/session", Map.of("ticket", v.get("ticket").asText(), "studentId", "GVS-2027-0001"));
        assertEquals(401, s.get("_status").asInt());
        assertEquals("NOT_LINKED", s.get("code").asText());
    }

    @Test
    void unregisteredNumberStillGetsAChallengeButNoAccess() throws Exception {
        JsonNode c = api.otp("9000000001", "PARENT_LOGIN");
        JsonNode v = verifyParent(c, c.get("devCode").asText());
        assertEquals("NO_LINKS", v.get("code").asText());
        assertEquals(400, api.post("/api/auth/otp/request", Map.of("mobile", "12345", "purpose", "PARENT_LOGIN")).get("_status").asInt());
    }

    @Test
    void wrongCodesAreCountedAndLockTheChallenge() throws Exception {
        JsonNode c = api.otp("9876543211", "PARENT_LOGIN");
        String wrong = c.get("devCode").asText().equals("000000") ? "111111" : "000000";
        for (int left = 4; left >= 1; left--) {
            JsonNode r = verifyParent(c, wrong);
            assertEquals("WRONG_CODE", r.get("code").asText());
            assertEquals(left, r.get("attemptsRemaining").asInt(), "wrong attempt was not persisted");
        }
        assertEquals("LOCKED", verifyParent(c, wrong).get("code").asText());
        // Even the right code no longer works.
        assertEquals("LOCKED", verifyParent(c, c.get("devCode").asText()).get("code").asText());
        assertEquals(0, challenges.findById(c.get("challengeId").asText()).orElseThrow().getAttemptsLeft());
    }

    @Test
    void codeIsSingleUseAndBoundToPurpose() throws Exception {
        JsonNode c = api.otp("9848022222", "TEACHER_LOGIN");
        // A teacher-login code cannot be used for a parent login.
        assertEquals("NOT_FOUND", verifyParent(c, c.get("devCode").asText()).get("code").asText());
        JsonNode ok = api.post("/api/auth/teacher/verify", Map.of("challengeId", c.get("challengeId").asText(), "code", c.get("devCode").asText()));
        assertEquals(200, ok.get("_status").asInt());
        assertEquals("Raghavan Nair", ok.get("displayName").asText());
        JsonNode again = api.post("/api/auth/teacher/verify", Map.of("challengeId", c.get("challengeId").asText(), "code", c.get("devCode").asText()));
        assertEquals("NOT_FOUND", again.get("code").asText());
    }

    @Test
    void resendHasACooldownAndRequestsAreRateLimited() throws Exception {
        JsonNode c = api.otp("9000000002", "PARENT_LOGIN");
        assertEquals("COOLDOWN", api.post("/api/auth/otp/resend", Map.of("challengeId", c.get("challengeId").asText())).get("code").asText());
        // Limit is app.otp.rate-max per 15 minutes (5 in production, 50 in tests).
        int ok = 1;
        JsonNode r;
        while ((r = api.post("/api/auth/otp/request", Map.of("mobile", "9000000002", "purpose", "PARENT_LOGIN"))).get("_status").asInt() == 200) ok++;
        assertEquals(429, r.get("_status").asInt());
        assertEquals("RATE_LIMITED", r.get("code").asText());
        assertEquals(50, ok);
    }

    @Test
    void teacherHasOneSchoolAndCannotUseAnotherPersonsMembership() throws Exception {
        JsonNode c = api.otp("9848012345", "TEACHER_LOGIN");
        JsonNode v = api.post("/api/auth/teacher/verify", Map.of("challengeId", c.get("challengeId").asText(), "code", c.get("devCode").asText()));
        assertEquals(1, v.get("memberships").size());
        // Another person's membership (same school, or another school) is refused.
        for (String other : new String[]{"MEM-T-0003", "MEM-T-0101"}) {
            JsonNode bad = api.post("/api/auth/teacher/session", Map.of("ticket", v.get("ticket").asText(), "membershipId", other));
            assertEquals("NOT_LINKED", bad.get("code").asText(), other);
        }
    }

    @Test
    void leadershipAlwaysNeedsTheEmailSecondFactor() throws Exception {
        JsonNode wrong = api.post("/api/auth/staff/password", Map.of("email", "admin@greenwoodvalley.edu.in", "password", "nope"));
        assertEquals(401, wrong.get("_status").asInt());
        assertEquals("We could not sign you in with those details.", wrong.get("error").asText());
        assertEquals(wrong.get("error").asText(),
                api.post("/api/auth/staff/password", Map.of("email", "nobody@x.in", "password", "nope")).get("error").asText());

        JsonNode f = api.post("/api/auth/staff/password", Map.of("email", "admin@greenwoodvalley.edu.in", "password", "Greenwood@2026"));
        // The first-factor ticket cannot open a session.
        assertEquals(401, api.post("/api/auth/staff/session", Map.of("ticket", f.get("ticket").asText(), "membershipId", "MEM-L-0002")).get("_status").asInt());
        // A parent OTP cannot complete the staff second factor.
        JsonNode p = api.otp("9876543210", "PARENT_LOGIN");
        JsonNode mixed = api.post("/api/auth/staff/verify", Map.of("ticket", f.get("ticket").asText(), "challengeId", p.get("challengeId").asText(), "code", p.get("devCode").asText()));
        assertEquals(401, mixed.get("_status").asInt());

        String token = api.staff("admin@greenwoodvalley.edu.in", "Greenwood@2026", "GVS");
        JsonNode me = api.getJson("/api/auth/me", token);
        assertEquals("ACC-L-0002", me.get("id").asText());
        assertEquals("admin", me.get("role").asText());
    }

    @Test
    void adminSessionCarriesPermissionsAndQuorum() throws Exception {
        JsonNode f = api.post("/api/auth/staff/password", Map.of("email", "office@greenwoodvalley.edu.in", "password", "Greenwood@2026"));
        JsonNode sf = f.get("secondFactor");
        JsonNode v = api.post("/api/auth/staff/verify", Map.of("ticket", f.get("ticket").asText(), "challengeId", sf.get("challengeId").asText(), "code", sf.get("devCode").asText()));
        JsonNode s = api.post("/api/auth/staff/session", Map.of("ticket", v.get("ticket").asText(), "membershipId", "MEM-L-0003"));
        assertTrue(s.get("adminPermissions").toString().contains("TRANSPORT"));
        assertFalse(s.get("adminPermissions").toString().contains("FINANCE"));
        assertEquals(2, s.get("adminQuorum").get("activeAdmins").asInt());
        assertEquals("[\"PASSWORD\",\"EMAIL_OTP\"]", s.get("authMethods").toString());
    }

    @Test
    void logoutEndsTheSession() throws Exception {
        String t = api.teacher("9848022222", "GVS");
        assertEquals(200, api.status("/api/auth/me", t));
        api.post("/api/auth/logout", Map.of(), t);
        assertEquals(401, api.status("/api/auth/me", t));
    }

    @Test
    void stepUpIssuesAShortLivedTokenForThisSession() throws Exception {
        String t = api.parent("9876543210", "GVS-2027-0001");
        JsonNode c = api.post("/api/auth/step-up/request", Map.of("purpose", "PAYMENT"), t);
        assertEquals(200, c.get("_status").asInt(), c.toString());
        assertEquals("+91 ••••••3210", c.get("maskedDestination").asText());
        JsonNode v = api.post("/api/auth/step-up/verify", Map.of("challengeId", c.get("challengeId").asText(), "code", c.get("devCode").asText()), t);
        assertFalse(v.get("stepUpToken").asText().isBlank());
        // Another session cannot use this challenge.
        String other = api.parent("9876543211", "GVS-2027-0001");
        JsonNode c2 = api.post("/api/auth/step-up/request", Map.of("purpose", "PAYMENT"), t);
        assertEquals(401, api.post("/api/auth/step-up/verify", Map.of("challengeId", c2.get("challengeId").asText(), "code", c2.get("devCode").asText()), other).get("_status").asInt());
        assertEquals(400, api.post("/api/auth/step-up/request", Map.of("purpose", "ANYTHING"), t).get("_status").asInt());
    }

    @Test
    void passwordLoginNoLongerExists() throws Exception {
        int status = api.post("/api/auth/login", Map.of("loginId", "ACC-L-0002", "password", "Greenwood@2026")).get("_status").asInt();
        assertTrue(status == 401 || status == 403, "password-only login must be gone, got " + status);
    }
}
