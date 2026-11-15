package com.futureschool.backend;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.futureschool.backend.entity.PaymentOrder;
import com.futureschool.backend.parent.PaymentGateway;
import com.futureschool.backend.repository.PaymentOrderRepository;
import com.futureschool.backend.tenant.TenantContext;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** End-to-end Razorpay + UPI payment tests: PIN step-up, order API, checkout HMAC, webhook HMAC & idempotency. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class RazorpayFlowTest {

    private static final String KEY_ID = "rzp_test_futureschool";
    private static final String KEY_SECRET = "test_secret_key_for_hmac_123";
    private static final String WEBHOOK_SECRET = "test_webhook_secret_456";

    private static HttpServer mockRazorpay;
    private static final AtomicInteger createdCount = new AtomicInteger();

    @DynamicPropertySource
    static void configureRazorpay(DynamicPropertyRegistry r) throws Exception {
        if (mockRazorpay == null) {
            mockRazorpay = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            mockRazorpay.createContext("/v1/orders", ex -> {
                byte[] body = ex.getRequestBody().readAllBytes();
                JsonNode req = new ObjectMapper().readTree(body);
                int n = createdCount.incrementAndGet();
                String resp = "{\"id\":\"order_rzp_" + n + "\",\"amount\":" + req.get("amount").asLong() + ",\"currency\":\"INR\"}";
                byte[] out = resp.getBytes(StandardCharsets.UTF_8);
                ex.getResponseHeaders().add("Content-Type", "application/json");
                ex.sendResponseHeaders(200, out.length);
                ex.getResponseBody().write(out);
                ex.close();
            });
            mockRazorpay.start();
        }
        int port = mockRazorpay.getAddress().getPort();
        r.add("app.payments.provider", () -> "razorpay");
        r.add("app.payments.razorpay.key-id", () -> KEY_ID);
        r.add("app.payments.razorpay.key-secret", () -> KEY_SECRET);
        r.add("app.payments.razorpay.webhook-secret", () -> WEBHOOK_SECRET);
        r.add("app.payments.razorpay.base-url", () -> "http://127.0.0.1:" + port + "/v1");
    }

    @AfterAll
    static void tearDown() {
        if (mockRazorpay != null) {
            mockRazorpay.stop(0);
            mockRazorpay = null;
        }
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired PaymentOrderRepository orders;
    Api api;

    @BeforeEach
    void setUp() {
        api = new Api(mvc, json);
    }

    @Test
    @Order(1)
    void razorpayOrderRequiresStepUpAndVerifiesCheckoutSignatureIdempotently() throws Exception {
        String parent = api.parent("9876543211", "GVS-2027-0001"); // Meena, Aarav owes 6000 on ins 2
        int callsBefore = createdCount.get();

        // Missing step-up token is refused before contacting Razorpay.
        JsonNode denied = api.post("/api/parent/fees/orders", Map.of("instalments", List.of(2)), parent);
        assertEquals(401, denied.get("_status").asInt());
        assertEquals("STEP_UP_REQUIRED", denied.get("code").asText());
        assertEquals(callsBefore, createdCount.get());

        // Valid PAYMENT step-up creates a real Razorpay order in paise.
        String stepUp = api.stepUp(parent, "PAYMENT");
        JsonNode order = api.post("/api/parent/fees/orders", Map.of("instalments", List.of(2), "stepUpToken", stepUp), parent);
        assertEquals(200, order.get("_status").asInt(), order.toString());
        assertFalse(order.get("isMock").asBoolean());
        assertEquals("razorpay", order.get("provider").asText());
        assertEquals(KEY_ID, order.get("razorpayKeyId").asText());
        assertEquals(600000L, order.get("amountPaise").asLong());
        String localOrderId = order.get("orderId").asText();
        String rzpOrderId = order.get("razorpayOrderId").asText();
        assertTrue(rzpOrderId.startsWith("order_rzp_"));

        // confirm-mock is blocked when Razorpay is active.
        JsonNode mockBlocked = api.post("/api/parent/fees/orders/" + localOrderId + "/confirm-mock",
                Map.of("method", "UPI", "stepUpToken", api.stepUp(parent, "PAYMENT")), parent);
        assertEquals(400, mockBlocked.get("_status").asInt());
        assertEquals("RAZORPAY_REQUIRED", mockBlocked.get("code").asText());

        // Invalid signature is rejected.
        String rzpPayId = "pay_rzp_upi_101";
        JsonNode badSig = api.post("/api/parent/fees/orders/" + localOrderId + "/verify",
                Map.of("razorpayOrderId", rzpOrderId, "razorpayPaymentId", rzpPayId, "razorpaySignature", "tampered", "method", "UPI"),
                parent);
        assertEquals(401, badSig.get("_status").asInt());
        assertEquals("PAYMENT_SIGNATURE_INVALID", badSig.get("code").asText());

        // Valid HMAC signature settles payment cleanly.
        String validSig = PaymentGateway.Routing.hmacSha256Hex((rzpOrderId + "|" + rzpPayId).getBytes(StandardCharsets.UTF_8), KEY_SECRET);
        JsonNode paid = api.post("/api/parent/fees/orders/" + localOrderId + "/verify",
                Map.of("razorpayOrderId", rzpOrderId, "razorpayPaymentId", rzpPayId, "razorpaySignature", validSig, "method", "UPI"),
                parent);
        assertEquals(200, paid.get("_status").asInt(), paid.toString());
        assertFalse(paid.get("isMock").asBoolean());
        assertEquals("UPI", paid.get("method").asText());
        assertEquals(rzpPayId, paid.get("providerRef").asText());

        // Duplicate client verification returns existing payment idempotently.
        JsonNode replay = api.post("/api/parent/fees/orders/" + localOrderId + "/verify",
                Map.of("razorpayOrderId", rzpOrderId, "razorpayPaymentId", rzpPayId, "razorpaySignature", validSig, "method", "UPI"),
                parent);
        assertEquals(200, replay.get("_status").asInt());
        assertEquals(paid.get("id").asText(), replay.get("id").asText());

        // Duplicate webhook after client verify is idempotent.
        byte[] hookPayload = ("{\"event\":\"payment.captured\",\"payload\":{\"payment\":{\"entity\":{\"id\":\"" + rzpPayId +
                "\",\"order_id\":\"" + rzpOrderId + "\",\"amount\":600000,\"currency\":\"INR\",\"method\":\"upi\",\"notes\":{\"schoolId\":\"GVS\"}}}}}")
                .getBytes(StandardCharsets.UTF_8);
        String hookSig = PaymentGateway.Routing.hmacSha256Hex(hookPayload, WEBHOOK_SECRET);
        MvcResult dupHook = mvc.perform(post("/api/payments/razorpay/webhook")
                .contentType(MediaType.APPLICATION_JSON)
                .header("X-Razorpay-Signature", hookSig)
                .content(hookPayload)).andReturn();
        assertEquals(200, dupHook.getResponse().getStatus());
        assertEquals("already_recorded", json.readTree(dupHook.getResponse().getContentAsString()).get("status").asText());
    }

    @Test
    @Order(2)
    void razorpayWebhookVerifiesSignatureAmountAndSettlesWithoutClientCallback() throws Exception {
        String kavyaParent = api.parent("9848011111", "GVS-2028-0117");
        String stepUp = api.stepUp(kavyaParent, "PAYMENT");
        JsonNode order = api.post("/api/parent/fees/orders", Map.of("amount", 1500, "stepUpToken", stepUp), kavyaParent);
        assertEquals(200, order.get("_status").asInt(), order.toString());
        String rzpOrderId = order.get("razorpayOrderId").asText();

        byte[] payload = ("{\"event\":\"payment.captured\",\"payload\":{\"payment\":{\"entity\":{\"id\":\"pay_webhook_202\"," +
                "\"order_id\":\"" + rzpOrderId + "\",\"amount\":150000,\"currency\":\"INR\",\"method\":\"upi\",\"notes\":{\"schoolId\":\"GVS\"}}}}}")
                .getBytes(StandardCharsets.UTF_8);

        // Missing or wrong webhook signature is rejected.
        MvcResult badSig = mvc.perform(post("/api/payments/razorpay/webhook")
                .contentType(MediaType.APPLICATION_JSON)
                .header("X-Razorpay-Signature", "bad")
                .content(payload)).andReturn();
        assertEquals(401, badSig.getResponse().getStatus());

        // Amount mismatch is rejected even with valid signature.
        byte[] tamperedAmt = ("{\"event\":\"payment.captured\",\"payload\":{\"payment\":{\"entity\":{\"id\":\"pay_webhook_202\"," +
                "\"order_id\":\"" + rzpOrderId + "\",\"amount\":50000,\"currency\":\"INR\",\"method\":\"upi\",\"notes\":{\"schoolId\":\"GVS\"}}}}}")
                .getBytes(StandardCharsets.UTF_8);
        MvcResult badAmt = mvc.perform(post("/api/payments/razorpay/webhook")
                .contentType(MediaType.APPLICATION_JSON)
                .header("X-Razorpay-Signature", PaymentGateway.Routing.hmacSha256Hex(tamperedAmt, WEBHOOK_SECRET))
                .content(tamperedAmt)).andReturn();
        assertEquals(400, badAmt.getResponse().getStatus());

        // Genuine webhook settles the payment server-side inside GVS tenant context.
        MvcResult ok = mvc.perform(post("/api/payments/razorpay/webhook")
                .contentType(MediaType.APPLICATION_JSON)
                .header("X-Razorpay-Signature", PaymentGateway.Routing.hmacSha256Hex(payload, WEBHOOK_SECRET))
                .content(payload)).andReturn();
        assertEquals(200, ok.getResponse().getStatus(), ok.getResponse().getContentAsString());
        JsonNode body = json.readTree(ok.getResponse().getContentAsString());
        assertEquals("recorded", body.get("status").asText());

        // Verify payment appears in Kavya's parent payment history with isMock=false.
        JsonNode history = api.getJson("/api/parent/fees/payments", kavyaParent);
        boolean found = false;
        for (JsonNode p : history.get("payments")) {
            if ("pay_webhook_202".equals(p.get("providerRef").asText())) {
                assertFalse(p.get("isMock").asBoolean());
                assertEquals(1500L, p.get("amount").asLong());
                assertEquals("UPI", p.get("method").asText());
                found = true;
            }
        }
        assertTrue(found, "Webhook payment must appear in parent payment history");
    }

    @Test
    @Order(3)
    void expiredOrderWebhookRecoversLatePaymentAndAlertsOffice() throws Exception {
        String parent = api.parent("9876543211", "GVS-2027-0001"); // Aarav ins 3 still due
        String stepUp = api.stepUp(parent, "PAYMENT");
        JsonNode order = api.post("/api/parent/fees/orders", Map.of("instalments", List.of(3), "stepUpToken", stepUp), parent);
        assertEquals(200, order.get("_status").asInt(), order.toString());
        String localOrderId = order.get("orderId").asText();
        String rzpOrderId = order.get("razorpayOrderId").asText();
        long amountPaise = order.get("amountPaise").asLong();

        // Force expiry on the order, then simulate client verify rejecting as ORDER_EXPIRED
        TenantContext.runAs("GVS", () -> {
            PaymentOrder o = orders.findById(localOrderId).orElseThrow();
            o.setExpiresAt(Instant.now().minusSeconds(60));
            orders.save(o);
        });
        String rzpPayId = "pay_late_capture_303";
        String validSig = PaymentGateway.Routing.hmacSha256Hex((rzpOrderId + "|" + rzpPayId).getBytes(StandardCharsets.UTF_8), KEY_SECRET);
        JsonNode expiredVerify = api.post("/api/parent/fees/orders/" + localOrderId + "/verify",
                Map.of("razorpayOrderId", rzpOrderId, "razorpayPaymentId", rzpPayId, "razorpaySignature", validSig, "method", "UPI"),
                parent);
        assertEquals(400, expiredVerify.get("_status").asInt());
        assertEquals("ORDER_EXPIRED", expiredVerify.get("code").asText());

        // Money was actually captured by Razorpay -> webhook arrives late and recovers payment + creates office alert
        byte[] payload = ("{\"event\":\"payment.captured\",\"payload\":{\"payment\":{\"entity\":{\"id\":\"" + rzpPayId +
                "\",\"order_id\":\"" + rzpOrderId + "\",\"amount\":" + amountPaise + ",\"currency\":\"INR\",\"method\":\"upi\",\"notes\":{\"schoolId\":\"GVS\"}}}}}")
                .getBytes(StandardCharsets.UTF_8);
        MvcResult hookRes = mvc.perform(post("/api/payments/razorpay/webhook")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-Razorpay-Signature", PaymentGateway.Routing.hmacSha256Hex(payload, WEBHOOK_SECRET))
                        .content(payload))
                .andReturn();
        assertEquals(200, hookRes.getResponse().getStatus(), hookRes.getResponse().getContentAsString());
        JsonNode hookBody = json.readTree(hookRes.getResponse().getContentAsString());
        assertEquals("recorded_after_expiry", hookBody.get("status").asText());
        assertTrue(hookBody.get("lateCaptureAlert").asBoolean());

        // Office sees late-capture alert in fee desk alerts
        String financeAdmin = api.staff("admin@greenwoodvalley.edu.in", "Greenwood@2026", "GVS");
        JsonNode alerts = api.getJson("/api/office/fees/alerts", financeAdmin);
        boolean foundAlert = false;
        for (JsonNode a : alerts) {
            if ("PAYMENT_CAPTURED_AFTER_EXPIRY".equals(a.get("action").asText())
                    && a.get("details").asText().contains(rzpPayId)) {
                foundAlert = true;
                break;
            }
        }
        assertTrue(foundAlert, alerts.toString());
    }

    @Test
    @Order(4)
    void staleExpiredOrderWebhookRaisesUnrecordedPaymentAlertForOffice() throws Exception {
        String parent = api.parent("9848011111", "GVS-2028-0117");
        String stepUp = api.stepUp(parent, "PAYMENT");
        JsonNode order = api.post("/api/parent/fees/orders", Map.of("amount", 1000, "stepUpToken", stepUp), parent);
        assertEquals(200, order.get("_status").asInt(), order.toString());
        String localOrderId = order.get("orderId").asText();
        String rzpOrderId = order.get("razorpayOrderId").asText();

        // Expire the order AND clear remaining fees at the office so the order's allocations are stale
        TenantContext.runAs("GVS", () -> {
            PaymentOrder o = orders.findById(localOrderId).orElseThrow();
            o.setExpiresAt(Instant.now().minusSeconds(60));
            orders.save(o);
        });
        String financeAdmin = api.staff("admin@greenwoodvalley.edu.in", "Greenwood@2026", "GVS");
        JsonNode acct = api.getJson("/api/office/fees/account?studentId=GVS-2028-0117", financeAdmin);
        long remaining = acct.get("summary").get("totalOutstanding").asLong();
        if (remaining > 0) {
            JsonNode cash = api.post("/api/office/fees/cash",
                    Map.of("studentId", "GVS-2028-0117", "amount", remaining, "note", "Paid at counter"),
                    financeAdmin);
            assertEquals(200, cash.get("_status").asInt(), cash.toString());
        }

        // Now Razorpay webhook arrives for the expired order -> cannot double-record fee, so raises urgent office alert
        String stalePayId = "pay_unrecorded_404";
        byte[] payload = ("{\"event\":\"payment.captured\",\"payload\":{\"payment\":{\"entity\":{\"id\":\"" + stalePayId +
                "\",\"order_id\":\"" + rzpOrderId + "\",\"amount\":100000,\"currency\":\"INR\",\"method\":\"upi\",\"notes\":{\"schoolId\":\"GVS\"}}}}}")
                .getBytes(StandardCharsets.UTF_8);
        MvcResult hookRes = mvc.perform(post("/api/payments/razorpay/webhook")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-Razorpay-Signature", PaymentGateway.Routing.hmacSha256Hex(payload, WEBHOOK_SECRET))
                        .content(payload))
                .andReturn();
        assertEquals(200, hookRes.getResponse().getStatus(), hookRes.getResponse().getContentAsString());
        JsonNode body = json.readTree(hookRes.getResponse().getContentAsString());
        assertEquals("unrecorded_alert", body.get("status").asText());
        assertTrue(body.get("alertRecorded").asBoolean());

        JsonNode alerts = api.getJson("/api/office/fees/alerts", financeAdmin);
        boolean foundUnrecorded = false;
        for (JsonNode a : alerts) {
            if ("PAYMENT_CAPTURE_UNRECORDED".equals(a.get("action").asText())
                    && a.get("details").asText().contains(stalePayId)) {
                foundUnrecorded = true;
                break;
            }
        }
        assertTrue(foundUnrecorded, alerts.toString());
    }
}
