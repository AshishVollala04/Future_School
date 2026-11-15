package com.futureschool.backend;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.futureschool.backend.repository.OtpChallengeRepository;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Parent PIN, like teachers but on the account: SMS code the first time on a phone, then set a PIN;
 * next time on that phone the PIN only (no SMS), then pick a child. Forgot / locked: SMS code ->
 * new PIN. Srinivas Reddy (9848011111, Kavya GVS-2028-0117) in a fresh context: starts with no PIN.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class ParentPinTest {

    static final String SRINIVAS = "9848011111";
    static final String KAVYA = "GVS-2028-0117";

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired OtpChallengeRepository challenges;
    Api api;

    static String device;

    @BeforeEach
    void setUp() {
        api = new Api(mvc, json);
    }

    private JsonNode verified() throws Exception {
        JsonNode c = api.otp(SRINIVAS, "PARENT_LOGIN");
        return api.post("/api/auth/parent/verify", Map.of("challengeId", c.get("challengeId").asText(), "code", c.get("devCode").asText()));
    }

    private JsonNode session(JsonNode v, String pin, boolean forgot) throws Exception {
        Map<String, Object> b = new HashMap<>(Map.of("ticket", v.get("ticket").asText(), "studentId", KAVYA));
        if (pin != null) b.put("pin", pin);
        if (forgot) b.put("forgotPin", true);
        return api.post("/api/auth/parent/session", b);
    }

    private JsonNode pinLogin(String token, String pin) throws Exception {
        return api.post("/api/auth/parent/pin-login", Map.of("deviceToken", token, "pin", pin));
    }

    @Test
    @Order(1)
    void firstTimeSmsThenSetAPinBeforeAnythingElse() throws Exception {
        JsonNode v = verified();
        assertFalse(v.get("requiresPin").asBoolean());
        String s = session(v, null, false).get("accessToken").asText();
        assertEquals(403, api.status("/api/parent/fees/summary", s), "nothing opens before a PIN");
        assertTrue(api.getJson("/api/parent/pin", s).get("setupRequired").asBoolean());
        assertEquals("PIN_SETUP_REQUIRED", api.post("/api/auth/parent/device", Map.of(), s).get("code").asText());
        for (String weak : new String[]{"1111", "1234", "9848", "1111"}) {
            assertEquals("WEAK_PIN", api.post("/api/parent/pin", Map.of("pin", weak), s).get("code").asText(), weak);
        }
        assertEquals(200, api.post("/api/parent/pin", Map.of("pin", "4826"), s).get("_status").asInt());
        assertEquals(200, api.status("/api/parent/fees/summary", s));

        JsonNode d = api.post("/api/auth/parent/device", Map.of("label", "Chrome on Android"), s);
        assertEquals(200, d.get("_status").asInt(), d.toString());
        assertEquals("Srinivas Reddy", d.get("name").asText());
        device = d.get("deviceToken").asText();
    }

    @Test
    @Order(2)
    void nextTimeThePinAloneThenPickAChildNoSms() throws Exception {
        long sms = challenges.count();
        JsonNode v = pinLogin(device, "4826");
        assertEquals(200, v.get("_status").asInt(), v.toString());
        assertEquals(1, v.get("children").size());
        assertFalse(v.get("requiresPin").asBoolean(), "the PIN was just entered");
        JsonNode s = session(v, null, false);
        assertEquals(200, s.get("_status").asInt(), s.toString());
        assertEquals(List.of("DEVICE", "PIN"), json.convertValue(s.get("authMethods"), List.class));
        assertEquals(sms, challenges.count(), "no SMS was sent");
        assertEquals(200, api.status("/api/parent/fees/summary", s.get("accessToken").asText()));
        assertEquals("OTP_REQUIRED", api.post("/api/auth/parent/device", Map.of(), s.get("accessToken").asText()).get("code").asText());
        // A teacher's device token is not a parent's, and the other way round.
        assertEquals("DEVICE_UNKNOWN", api.post("/api/auth/teacher/pin-login", Map.of("deviceToken", device, "pin", "4826")).get("code").asText());
    }

    @Test
    @Order(3)
    void afterAnSmsCodeAnExistingPinIsAskedAndForgotPinResetsIt() throws Exception {
        for (int left = 4; left >= 1; left--) assertEquals(left, pinLogin(device, "1357").get("attemptsRemaining").asInt());
        assertEquals("PIN_LOCKED", pinLogin(device, "1357").get("code").asText());

        JsonNode v = verified();
        assertTrue(v.get("requiresPin").asBoolean());
        assertEquals("PIN_LOCKED", session(v, "4826", false).get("code").asText());
        JsonNode r = session(v, null, true);
        assertEquals(200, r.get("_status").asInt(), r.toString());
        String s = r.get("accessToken").asText();
        assertEquals(403, api.status("/api/parent/fees/summary", s));
        assertEquals(200, api.post("/api/parent/pin", Map.of("pin", "7395"), s).get("_status").asInt(), "no second SMS");
        assertEquals(200, api.status("/api/parent/fees/summary", s));
        assertEquals("PIN_INVALID", pinLogin(device, "4826").get("code").asText());
        assertEquals(200, pinLogin(device, "7395").get("_status").asInt());
    }

    @Test
    @Order(4)
    void changingThePinNeedsAFreshOtp() throws Exception {
        String s = session(pinLogin(device, "7395"), null, false).get("accessToken").asText();
        assertEquals("STEP_UP_REQUIRED", api.post("/api/parent/pin", Map.of("pin", "6159"), s).get("code").asText());
        JsonNode ok = api.post("/api/parent/pin", Map.of("pin", Api.DEMO_PIN, "stepUpToken", api.stepUp(s, "PIN_CHANGE")), s);
        assertEquals(200, ok.get("_status").asInt(), ok.toString());
        // Teachers have their own PIN endpoint; a parent cannot use it.
        assertEquals(403, api.status("/api/staff/pin", s));
    }

    @Test
    @Order(5)
    void aParentConfirmsAPaymentWithThePinNoSms() throws Exception {
        String s = session(pinLogin(device, Api.DEMO_PIN), null, false).get("accessToken").asText();
        long sms = challenges.count();
        JsonNode order = api.post("/api/parent/fees/orders", Map.of("amount", 1000), s);
        String url = "/api/parent/fees/orders/" + order.get("orderId").asText() + "/confirm-mock";

        assertEquals("PIN_INVALID", api.post("/api/auth/step-up/pin", Map.of("purpose", "PAYMENT", "pin", "1357"), s).get("code").asText());
        assertEquals("OTP_REQUIRED", api.post("/api/auth/step-up/pin", Map.of("purpose", "SENSITIVE_STAFF_ACTION", "pin", Api.DEMO_PIN), s).get("code").asText(),
                "only payments and pickup passes can use the PIN");
        assertEquals("OTP_REQUIRED", api.post("/api/auth/step-up/pin", Map.of("purpose", "PIN_CHANGE", "pin", Api.DEMO_PIN), s).get("code").asText(),
                "changing the PIN still needs an SMS code");

        JsonNode t = api.post("/api/auth/step-up/pin", Map.of("purpose", "PAYMENT", "pin", Api.DEMO_PIN), s);
        assertEquals(200, t.get("_status").asInt(), t.toString());
        JsonNode paid = api.post(url, Map.of("method", "UPI", "stepUpToken", t.get("stepUpToken").asText()), s);
        assertEquals(200, paid.get("_status").asInt(), paid.toString());
        JsonNode again = api.post("/api/parent/fees/orders", Map.of("amount", 1000), s);
        assertTrue(again.has("orderId"), again.toString());
        assertEquals("STEP_UP_REQUIRED", api.post("/api/parent/fees/orders/" + again.get("orderId").asText() + "/confirm-mock",
                Map.of("method", "UPI", "stepUpToken", t.get("stepUpToken").asText()), s).get("code").asText(), "the token is single use");
        assertEquals(sms, challenges.count(), "no SMS was sent for the payment");

        // A pickup token is not a payment token, and teachers cannot use this.
        String pickup = api.post("/api/auth/step-up/pin", Map.of("purpose", "PICKUP_AUTHORIZATION", "pin", Api.DEMO_PIN), s).get("stepUpToken").asText();
        JsonNode order2 = api.post("/api/parent/fees/orders", Map.of("amount", 1000), s);
        assertEquals("STEP_UP_REQUIRED", api.post("/api/parent/fees/orders/" + order2.get("orderId").asText() + "/confirm-mock",
                Map.of("method", "UPI", "stepUpToken", pickup), s).get("code").asText());
        assertEquals(403, api.post("/api/auth/step-up/pin", Map.of("purpose", "PAYMENT", "pin", Api.DEMO_PIN), api.teacher("9848012345", "GVS")).get("_status").asInt());
    }
}
