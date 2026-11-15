package com.futureschool.backend;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** Test helper: drives the real sign-in endpoints (OTP code read from the dev-reveal field). */
final class Api {

    private final MockMvc mvc;
    private final ObjectMapper json;

    Api(MockMvc mvc, ObjectMapper json) {
        this.mvc = mvc;
        this.json = json;
    }

    JsonNode post(String url, Object body) throws Exception {
        return post(url, body, null);
    }

    JsonNode post(String url, Object body, String token) throws Exception {
        var req = org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(url).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(body));
        if (token != null) req.header("Authorization", "Bearer " + token);
        MvcResult r = mvc.perform(req).andReturn();
        String s = r.getResponse().getContentAsString();
        JsonNode n = s.isBlank() ? json.createObjectNode() : json.readTree(s);
        if (n.isObject()) ((ObjectNode) n).put("_status", r.getResponse().getStatus());
        return n;
    }

    int status(String url, String token) throws Exception {
        return mvc.perform(get(url).header("Authorization", "Bearer " + token)).andReturn().getResponse().getStatus();
    }

    JsonNode getJson(String url, String token) throws Exception {
        return json.readTree(mvc.perform(get(url).header("Authorization", "Bearer " + token)).andReturn().getResponse().getContentAsString());
    }

    JsonNode otp(String mobile, String purpose) throws Exception {
        JsonNode c = post("/api/auth/otp/request", Map.of("mobile", mobile, "purpose", purpose));
        assertEquals(200, c.get("_status").asInt(), c.toString());
        return c;
    }

    /** Parent: OTP -> session for the given child. */
    String parent(String mobile, String studentId) throws Exception {
        JsonNode c = otp(mobile, "PARENT_LOGIN");
        JsonNode v = post("/api/auth/parent/verify", Map.of("challengeId", c.get("challengeId").asText(), "code", c.get("devCode").asText()));
        assertEquals(200, v.get("_status").asInt(), v.toString());
        boolean hasPin = v.get("requiresPin").asBoolean();
        Map<String, String> body = new java.util.HashMap<>(Map.of("ticket", v.get("ticket").asText(), "studentId", studentId));
        if (hasPin) body.put("pin", DEMO_PIN);
        JsonNode s = post("/api/auth/parent/session", body);
        assertEquals(200, s.get("_status").asInt(), s.toString());
        String token = s.get("accessToken").asText();
        // The PIN is required: a parent without one sets the demo PIN first (as the app makes them do).
        if (!hasPin) {
            JsonNode set = post("/api/parent/pin", Map.of("pin", DEMO_PIN), token);
            assertEquals(200, set.get("_status").asInt(), set.toString());
        }
        return token;
    }

    /** Teacher: OTP -> session for the membership in the given school. */
    String teacher(String mobile, String school) throws Exception {
        JsonNode c = otp(mobile, "TEACHER_LOGIN");
        JsonNode v = post("/api/auth/teacher/verify", Map.of("challengeId", c.get("challengeId").asText(), "code", c.get("devCode").asText()));
        assertEquals(200, v.get("_status").asInt(), v.toString());
        String mid = pick(v, school);
        Map<String, String> body = new java.util.HashMap<>(Map.of("ticket", v.get("ticket").asText(), "membershipId", mid));
        if (requiresPin(v, mid)) body.put("pin", DEMO_PIN);
        JsonNode s = post("/api/auth/teacher/session", body);
        assertEquals(200, s.get("_status").asInt(), s.toString());
        String token = s.get("accessToken").asText();
        // The PIN is required: a teacher without one sets the demo PIN first (as the app makes them do).
        if (!requiresPin(v, mid)) {
            JsonNode set = post("/api/staff/pin", Map.of("pin", DEMO_PIN), token);
            assertEquals(200, set.get("_status").asInt(), set.toString());
        }
        return token;
    }

    /** Principal/Admin: email + password -> email OTP -> session. */
    String staff(String email, String password, String school) throws Exception {
        JsonNode f = post("/api/auth/staff/password", Map.of("email", email, "password", password));
        assertEquals(200, f.get("_status").asInt(), f.toString());
        JsonNode sf = f.get("secondFactor");
        assertEquals("EMAIL", sf.get("channel").asText());
        JsonNode v = post("/api/auth/staff/verify", Map.of("ticket", f.get("ticket").asText(), "challengeId", sf.get("challengeId").asText(), "code", sf.get("devCode").asText()));
        assertEquals(200, v.get("_status").asInt(), v.toString());
        JsonNode s = post("/api/auth/staff/session", Map.of("ticket", v.get("ticket").asText(), "membershipId", pick(v, school)));
        assertEquals(200, s.get("_status").asInt(), s.toString());
        return s.get("accessToken").asText();
    }

    /** Raghavan Nair's demo sign-in PIN (seeded). */
    static final String DEMO_PIN = "2580";

    private static boolean requiresPin(JsonNode verification, String membershipId) {
        for (JsonNode m : verification.get("memberships")) {
            if (m.get("membershipId").asText().equals(membershipId)) return m.get("requiresPin").asBoolean();
        }
        return false;
    }

    /** A single-use SENSITIVE_STAFF_ACTION (or other) step-up token for this session. */
    String stepUp(String token, String purpose) throws Exception {
        JsonNode c = post("/api/auth/step-up/request", Map.of("purpose", purpose), token);
        assertEquals(200, c.get("_status").asInt(), c.toString());
        return post("/api/auth/step-up/verify", Map.of("challengeId", c.get("challengeId").asText(), "code", c.get("devCode").asText()), token)
                .get("stepUpToken").asText();
    }

    private static String pick(JsonNode verification, String school) {
        for (JsonNode m : verification.get("memberships")) if (m.get("schoolId").asText().equals(school)) return m.get("membershipId").asText();
        fail("no membership for " + school + " in " + verification);
        return null;
    }
}
