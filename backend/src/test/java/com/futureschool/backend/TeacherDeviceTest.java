package com.futureschool.backend;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.futureschool.backend.repository.OtpChallengeRepository;
import com.futureschool.backend.repository.TrustedDeviceRepository;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.junit.jupiter.api.Assertions.*;

/**
 * SMS only when needed: first time on a device (OTP -> set PIN -> device trusted), then PIN only.
 * Forgot / locked PIN: OTP -> set a new PIN (no Admin needed). Admin reset revokes devices.
 * Uses J. Mary (SJM, 9848033333) in a fresh context so she starts with no PIN.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class TeacherDeviceTest {

    static final String MARY = "9848033333";

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired TrustedDeviceRepository devices;
    @Autowired OtpChallengeRepository challenges;
    Api api;

    static String deviceToken;

    @BeforeEach
    void setUp() {
        api = new Api(mvc, json);
    }

    private JsonNode verified() throws Exception {
        JsonNode c = api.otp(MARY, "TEACHER_LOGIN");
        return api.post("/api/auth/teacher/verify", Map.of("challengeId", c.get("challengeId").asText(), "code", c.get("devCode").asText()));
    }

    private JsonNode otpSession(JsonNode v, String pin, boolean forgot) throws Exception {
        Map<String, Object> b = new HashMap<>(Map.of("ticket", v.get("ticket").asText(), "membershipId", "MEM-T-0101"));
        if (pin != null) b.put("pin", pin);
        if (forgot) b.put("forgotPin", true);
        return api.post("/api/auth/teacher/session", b);
    }

    private JsonNode pinLogin(String token, String pin) throws Exception {
        return api.post("/api/auth/teacher/pin-login", Map.of("deviceToken", token, "pin", pin));
    }

    @Test
    @Order(1)
    void firstTimeOtpThenPinThenThisDeviceIsTrusted() throws Exception {
        String s = otpSession(verified(), null, false).get("accessToken").asText();
        // Not before a PIN exists.
        assertEquals("PIN_SETUP_REQUIRED", api.post("/api/auth/teacher/device", Map.of(), s).get("code").asText());
        assertTrue(api.getJson("/api/staff/pin", s).get("setupRequired").asBoolean());
        assertEquals(200, api.post("/api/staff/pin", Map.of("pin", "4826"), s).get("_status").asInt());
        assertFalse(api.getJson("/api/staff/pin", s).get("setupRequired").asBoolean());

        JsonNode d = api.post("/api/auth/teacher/device", Map.of("label", "Chrome on Android"), s);
        assertEquals(200, d.get("_status").asInt(), d.toString());
        deviceToken = d.get("deviceToken").asText();
        assertTrue(deviceToken.length() >= 40);
        assertTrue(devices.findAll().stream().noneMatch(x -> x.getTokenHash().equals(deviceToken)), "only the hash is stored");
    }

    @Test
    @Order(2)
    void nextTimeThePinAloneSignsInWithoutAnySms() throws Exception {
        long smsBefore = challenges.count();
        JsonNode ok = pinLogin(deviceToken, "4826");
        assertEquals(200, ok.get("_status").asInt(), ok.toString());
        assertEquals("SJM", ok.get("schoolId").asText());
        List<String> methods = json.convertValue(ok.get("authMethods"), List.class);
        assertEquals(List.of("DEVICE", "PIN"), methods);
        assertEquals(smsBefore, challenges.count(), "no OTP was sent");
        String s = ok.get("accessToken").asText();
        assertEquals(200, api.status("/api/staff/assignments", s));
        // A PIN-only session cannot trust more devices.
        assertEquals("OTP_REQUIRED", api.post("/api/auth/teacher/device", Map.of(), s).get("code").asText());

        assertEquals("DEVICE_UNKNOWN", pinLogin("not-a-real-token", "4826").get("code").asText());
        assertEquals("PIN_REQUIRED", pinLogin(deviceToken, "").get("code").asText());
    }

    @Test
    @Order(3)
    void forgotOrLockedPinIsResetWithAnSmsCodeNoAdminNeeded() throws Exception {
        for (int left = 4; left >= 1; left--) assertEquals(left, pinLogin(deviceToken, "1357").get("attemptsRemaining").asInt());
        assertEquals("PIN_LOCKED", pinLogin(deviceToken, "1357").get("code").asText());
        assertEquals("PIN_LOCKED", pinLogin(deviceToken, "4826").get("code").asText(), "locked even with the right PIN");

        // Forgot PIN: OTP opens a session that can only set a new PIN, with no second OTP.
        JsonNode v = verified();
        assertEquals("PIN_LOCKED", otpSession(v, "4826", false).get("code").asText());
        JsonNode r = otpSession(v, null, true);
        assertEquals(200, r.get("_status").asInt(), r.toString());
        String s = r.get("accessToken").asText();
        assertEquals(403, api.status("/api/staff/assignments", s));
        assertTrue(api.getJson("/api/staff/pin", s).get("setupRequired").asBoolean());
        assertEquals("WEAK_PIN", api.post("/api/staff/pin", Map.of("pin", "3333"), s).get("code").asText());
        assertEquals(200, api.post("/api/staff/pin", Map.of("pin", "7395"), s).get("_status").asInt());
        assertEquals(200, api.status("/api/staff/assignments", s), "the same session works once the new PIN is set");

        // The trusted device keeps working, with the new PIN; the lock is cleared.
        assertEquals("PIN_INVALID", pinLogin(deviceToken, "4826").get("code").asText());
        assertEquals(200, pinLogin(deviceToken, "7395").get("_status").asInt());
    }

    @Test
    @Order(4)
    void forgettingTheDeviceOrAnAdminResetEndsPinOnlySignIn() throws Exception {
        // Second device, then forget it.
        JsonNode v = verified();
        String s = otpSession(v, "7395", false).get("accessToken").asText();
        String second = api.post("/api/auth/teacher/device", Map.of(), s).get("deviceToken").asText();
        assertEquals(200, pinLogin(second, "7395").get("_status").asInt());
        assertEquals(200, api.post("/api/auth/teacher/device/forget", Map.of("deviceToken", second)).get("_status").asInt());
        assertEquals("DEVICE_UNKNOWN", pinLogin(second, "7395").get("code").asText());
        assertEquals(200, pinLogin(deviceToken, "7395").get("_status").asInt(), "other devices are not affected");
        // (An Admin PIN reset revokes every device: TeacherPinTest.)
    }

    @Test
    @Order(5)
    void parallelWrongPinsCannotGetPastTheFiveTryLock() throws Exception {
        int n = 20;
        ExecutorService pool = Executors.newFixedThreadPool(n);
        List<Callable<JsonNode>> guesses = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            String guess = String.format("%04d", 1000 + i * 7); // all wrong (the PIN is 7395)
            guesses.add(() -> pinLogin(deviceToken, guess));
        }
        int invalid = 0, locked = 0;
        for (Future<JsonNode> f : pool.invokeAll(guesses)) {
            String code = f.get().get("code").asText();
            if (code.equals("PIN_INVALID")) invalid++;
            else if (code.equals("PIN_LOCKED")) locked++;
            else fail("unexpected " + f.get());
        }
        pool.shutdown();
        // Each guess takes a try before the PIN is compared: at most 5 are compared; the 5th and later are refused as locked.
        assertTrue(invalid <= 4, "at most 4 'incorrect' answers, got " + invalid);
        assertEquals(n, invalid + locked);
        assertEquals("PIN_LOCKED", pinLogin(deviceToken, "7395").get("code").asText(), "locked even with the right PIN");

        // Forgot PIN (SMS code) unlocks it; put back the demo PIN for later test classes in this context.
        String s = otpSession(verified(), null, true).get("accessToken").asText();
        assertEquals(200, api.post("/api/staff/pin", Map.of("pin", Api.DEMO_PIN), s).get("_status").asInt());
        assertEquals(200, pinLogin(deviceToken, Api.DEMO_PIN).get("_status").asInt());
    }
}
