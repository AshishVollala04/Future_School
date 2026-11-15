package com.futureschool.backend;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.TestMethodOrder;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Parent app data on the backend. Seed figures = frontend prototype.
 * Aarav (GVS 10-A): instalment 2 school fee half paid (6,000 due), hall ticket not released.
 * Ananya (GVS 6-B): sibling concession, fees cleared and released -> hall ticket available.
 * Rohan (SJM 4-B): other school.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class ParentDataTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    Api api;

    @BeforeEach
    void setUp() {
        api = new Api(mvc, json);
    }

    private String stepUp(String token, String purpose) throws Exception {
        JsonNode c = api.post("/api/auth/step-up/request", Map.of("purpose", purpose), token);
        JsonNode v = api.post("/api/auth/step-up/verify", Map.of("challengeId", c.get("challengeId").asText(), "code", c.get("devCode").asText()), token);
        return v.get("stepUpToken").asText();
    }

    private JsonNode ticketFor(String token, String exam) throws Exception {
        for (JsonNode t : api.getJson("/api/parent/hall-tickets", token)) if (t.get("exam").get("name").asText().equals(exam)) return t;
        return null;
    }

    @Test
    @Order(1) // seed figures, before any test pays
    void feeSummaryMatchesTheFrontendFigures() throws Exception {
        String t = api.parent("9876543210", "GVS-2027-0001");
        JsonNode s = api.getJson("/api/parent/fees/summary", t);
        assertEquals(57500, s.get("totalCharged").asLong());
        assertEquals(23000, s.get("totalPaid").asLong());
        assertEquals(34500, s.get("totalOutstanding").asLong());
        assertEquals(4, s.get("instalments").size());
        assertEquals(2, s.get("nextDue").get("instalment").get("number").asInt());
        assertEquals(6000, s.get("nextDue").get("amount").asLong());
        assertTrue(s.get("lateFeeNote").asText().contains("None is applied automatically"));

        JsonNode ananya = api.getJson("/api/parent/fees/summary", api.parent("9876543210", "GVS-2031-0042"));
        assertEquals(3600, ananya.get("totalConcession").asLong());
    }

    @Test
    void hallTicketNeedsFeesAndReleasePaymentAloneNeverReleases() throws Exception {
        String ananya = api.parent("9876543210", "GVS-2031-0042");
        JsonNode a = ticketFor(ananya, "SA-1");
        assertEquals("CLEARED", a.get("feeClearance").asText());
        assertTrue(a.get("available").asBoolean());
        assertEquals("SA-1-6B-07", a.get("hallTicketNo").asText());

        String aarav = api.parent("9876543211", "GVS-2027-0001"); // Meena, same child
        JsonNode before = ticketFor(aarav, "SA-1");
        assertEquals("PENDING", before.get("feeClearance").asText());
        assertEquals("Term 2: School fee ₹6,000 pending", before.get("pendingReasons").get(0).asText());
        assertFalse(before.get("available").asBoolean());
        assertFalse(before.has("hallTicketNo"));

        // Pay instalment 2 in full.
        JsonNode order = api.post("/api/parent/fees/orders", Map.of("instalments", List.of(2)), aarav);
        assertEquals(6000, order.get("amount").asLong(), order.toString());
        JsonNode paid = api.post("/api/parent/fees/orders/" + order.get("orderId").asText() + "/confirm-mock",
                Map.of("method", "UPI", "stepUpToken", stepUp(aarav, "PAYMENT")), aarav);
        assertEquals(200, paid.get("_status").asInt(), paid.toString());
        assertTrue(paid.get("isMock").asBoolean());
        assertEquals("GRD-0002", paid.get("paidByGuardianId").asText());

        JsonNode after = ticketFor(aarav, "SA-1");
        assertEquals("CLEARED", after.get("feeClearance").asText(), "fees should now be cleared");
        assertFalse(after.get("available").asBoolean(), "payment alone must never release a hall ticket");
    }

    @Test
    void paymentNeedsAFreshPaymentOtpAndTheServerDecidesTheAmount() throws Exception {
        String t = api.parent("9848011111", "GVS-2028-0117"); // Kavya
        JsonNode order = api.post("/api/parent/fees/orders", Map.of("amount", 2000), t);
        assertEquals(2000, order.get("amount").asLong());
        // Oldest due first: instalment 1 school fee (3,000 left) gets the 2,000.
        assertEquals("GVS-2028-0117-SF-1", order.get("allocations").get(0).get("chargeId").asText());
        String url = "/api/parent/fees/orders/" + order.get("orderId").asText() + "/confirm-mock";

        assertEquals("STEP_UP_REQUIRED", api.post(url, Map.of("method", "UPI"), t).get("code").asText());
        assertEquals("STEP_UP_REQUIRED", api.post(url, Map.of("method", "UPI", "stepUpToken", stepUp(t, "PICKUP_AUTHORIZATION")), t).get("code").asText());
        assertEquals("BAD_METHOD", api.post(url, Map.of("method", "CASH_AT_OFFICE", "stepUpToken", stepUp(t, "PAYMENT")), t).get("code").asText());

        String token = stepUp(t, "PAYMENT");
        assertEquals(200, api.post(url, Map.of("method", "CARD", "stepUpToken", token), t).get("_status").asInt());
        // Order and OTP token are single-use.
        assertEquals("NO_ORDER", api.post(url, Map.of("method", "CARD", "stepUpToken", stepUp(t, "PAYMENT")), t).get("code").asText());
        JsonNode again = api.post("/api/parent/fees/orders", Map.of("amount", 1500), t);
        assertEquals("STEP_UP_REQUIRED", api.post("/api/parent/fees/orders/" + again.get("orderId").asText() + "/confirm-mock",
                Map.of("method", "UPI", "stepUpToken", token), t).get("code").asText());

        assertEquals("BAD_AMOUNT", api.post("/api/parent/fees/orders", Map.of("amount", 500), t).get("code").asText());
        assertEquals("BAD_AMOUNT", api.post("/api/parent/fees/orders", Map.of("amount", 10_000_000), t).get("code").asText());
        JsonNode list = api.getJson("/api/parent/fees/payments", t);
        assertTrue(list.get("payments").size() >= 2);
    }

    @Test
    void anOrderBelongsToOneSessionAndOneChild() throws Exception {
        String rajesh = api.parent("9876543210", "GVS-2027-0001");
        JsonNode order = api.post("/api/parent/fees/orders", Map.of("amount", 1000), rajesh);
        String url = "/api/parent/fees/orders/" + order.get("orderId").asText() + "/confirm-mock";
        String meena = api.parent("9876543211", "GVS-2027-0001");
        assertEquals("NO_ORDER", api.post(url, Map.of("method", "UPI", "stepUpToken", stepUp(meena, "PAYMENT")), meena).get("code").asText());
        String rohan = api.parent("9876543210", "SJM-2033-0105");
        assertEquals("NO_ORDER", api.post(url, Map.of("method", "UPI", "stepUpToken", stepUp(rohan, "PAYMENT")), rohan).get("code").asText());
    }

    @Test
    void resultsAreVersionedCurrentFirstAndAbsentIsAB() throws Exception {
        JsonNode r = api.getJson("/api/parent/results", api.parent("9876543210", "GVS-2027-0001"));
        assertTrue(r.size() >= 4);
        java.util.List<JsonNode> fa1 = new java.util.ArrayList<>();
        for (JsonNode item : r) if ("FA-1".equals(item.get("examName").asText())) fa1.add(item);
        assertEquals(2, fa1.size());
        assertEquals("CURRENT", fa1.get(0).get("status").asText());
        assertEquals(2, fa1.get(0).get("version").asInt());
        assertEquals("SUPERSEDED", fa1.get(1).get("status").asText());
        JsonNode subjects = fa1.get(0).get("subjects");
        for (JsonNode s : subjects) {
            if (s.get("subject").asText().equals("Mathematics")) assertEquals(18, s.get("internal").asInt());
            if (s.get("subject").asText().equals("Biology")) assertEquals("AB", s.get("internal").asText());
        }
        // Rohan's school (St. Jude) is CBSE: only the exams already held, PT-1 and Half-Yearly, are published.
        assertEquals(2, api.getJson("/api/parent/results", api.parent("9876543210", "SJM-2033-0105")).size());
    }

    @Test
    void attendanceSkipsSundaysAndTodayUntilMarked() throws Exception {
        JsonNode a = api.getJson("/api/parent/attendance?days=30", api.parent("9876543210", "GVS-2027-0001"));
        String today = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Kolkata")).toString();
        assertTrue(a.get("days").size() > 20 && a.get("days").size() <= 30, a.get("days").size() + " days");
        for (JsonNode d : a.get("days")) {
            assertNotEquals(today, d.get("date").asText());
            assertNotEquals(java.time.DayOfWeek.SUNDAY, java.time.LocalDate.parse(d.get("date").asText()).getDayOfWeek());
        }
        double pct = a.get("percentage").asDouble();
        assertTrue(pct > 50 && pct <= 100, "percentage " + pct);
        assertEquals(a.get("days").size() * 2, a.get("workingSessions").asInt());
    }

    @Test
    void onlyParentsAndOnlyTheSessionChild() throws Exception {
        assertEquals(403, api.status("/api/parent/fees/summary", api.teacher("9848012345", "GVS")));
        assertEquals(401, mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/parent/fees/summary"))
                .andReturn().getResponse().getStatus());
        // There is no way to ask for another child: the URL has no student id, and extra params are ignored.
        String kavya = api.parent("9848011111", "GVS-2028-0117");
        JsonNode s = api.getJson("/api/parent/fees/summary?studentId=GVS-2027-0001", kavya);
        assertTrue(s.get("instalments").get(0).get("lines").get(0).get("charge").get("studentId").asText().equals("GVS-2028-0117"));
    }
}
