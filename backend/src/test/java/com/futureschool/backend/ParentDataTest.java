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

        // The school records the instalment-2 cash at the counter (parents do not pay in the app).
        String finance = api.staff("admin@greenwoodvalley.edu.in", "Greenwood@2026", "GVS");
        JsonNode paid = api.post("/api/office/fees/cash", Map.of("studentId", "GVS-2027-0001", "amount", 6000, "note", "Counter slip 12"), finance);
        assertEquals(200, paid.get("_status").asInt(), paid.toString());
        assertEquals("CASH_AT_OFFICE", paid.get("method").asText());
        assertFalse(paid.get("isMock").asBoolean(), "a recorded collection is real, never a demo payment");

        JsonNode after = ticketFor(aarav, "SA-1");
        assertEquals("CLEARED", after.get("feeClearance").asText(), "fees should now be cleared");
        assertFalse(after.get("available").asBoolean(), "recording a payment must never release a hall ticket");
    }

    @Test
    void parentsCannotPayOnlineAndStaffRecordedCashUpdatesDuesAndReceipts() throws Exception {
        String kavya = api.parent("9848011111", "GVS-2028-0117");
        // No payment-order, checkout or mock-payment endpoint exists for parents.
        assertEquals(403, api.post("/api/parent/fees/orders", Map.of("amount", 2000), kavya).get("_status").asInt());
        assertEquals(403, api.post("/api/parent/fees/orders/ORD-X/confirm-mock", Map.of("method", "UPI"), kavya).get("_status").asInt());
        assertEquals(403, api.post("/api/parent/fees/orders/ORD-X/verify", Map.of("razorpayOrderId", "x"), kavya).get("_status").asInt());
        int webhook = api.post("/api/payments/razorpay/webhook", Map.of("event", "payment.captured")).get("_status").asInt();
        assertTrue(webhook == 401 || webhook == 403, "the online-payment webhook is gone: " + webhook);

        JsonNode before = api.getJson("/api/parent/fees/summary", kavya);
        int receiptsBefore = api.getJson("/api/parent/fees/payments", kavya).get("payments").size();

        // Only finance staff record a collection, and never more than is outstanding.
        String finance = api.staff("admin@greenwoodvalley.edu.in", "Greenwood@2026", "GVS");
        assertEquals(403, api.post("/api/office/fees/cash", Map.of("studentId", "GVS-2028-0117", "amount", 1000), kavya).get("_status").asInt());
        assertEquals("BAD_AMOUNT", api.post("/api/office/fees/cash", Map.of("studentId", "GVS-2028-0117", "amount", 10_000_000), finance).get("code").asText());
        JsonNode cash = api.post("/api/office/fees/cash", Map.of("studentId", "GVS-2028-0117", "amount", 2000, "note", "Slip 41"), finance);
        assertEquals(200, cash.get("_status").asInt(), cash.toString());
        // Oldest due first: instalment 1 school fee gets the 2,000.
        assertEquals("GVS-2028-0117-SF-1", cash.get("allocations").get(0).get("chargeId").asText());
        String receiptNo = cash.get("receiptNo").asText();
        assertFalse(receiptNo.isBlank());

        JsonNode afterSummary = api.getJson("/api/parent/fees/summary", kavya);
        assertEquals(before.get("totalPaid").asLong() + 2000, afterSummary.get("totalPaid").asLong());
        assertEquals(before.get("totalOutstanding").asLong() - 2000, afterSummary.get("totalOutstanding").asLong());
        JsonNode receipts = api.getJson("/api/parent/fees/payments", kavya).get("payments");
        assertEquals(receiptsBefore + 1, receipts.size());
        boolean found = false;
        for (JsonNode r : receipts) found |= receiptNo.equals(r.get("receiptNo").asText());
        assertTrue(found, "the parent sees the official receipt the office issued");
    }

    @Test
    void aParentSeesOnlyTheSessionChildsDuesAndReceipts() throws Exception {
        String finance = api.staff("admin@greenwoodvalley.edu.in", "Greenwood@2026", "GVS");
        String receiptNo = api.post("/api/office/fees/cash", Map.of("studentId", "GVS-2028-0117", "amount", 500, "note", "Slip 42"), finance)
                .get("receiptNo").asText();
        // Rajesh's session is for Aarav: Kavya's receipt is not in his list, whatever he asks for.
        String rajesh = api.parent("9876543210", "GVS-2027-0001");
        for (JsonNode r : api.getJson("/api/parent/fees/payments", rajesh).get("payments")) {
            assertNotEquals(receiptNo, r.get("receiptNo").asText());
            assertEquals("GVS-2027-0001", r.get("studentId").asText());
        }
        for (JsonNode ins : api.getJson("/api/parent/fees/summary", rajesh).get("instalments")) {
            for (JsonNode line : ins.get("lines")) assertEquals("GVS-2027-0001", line.get("charge").get("studentId").asText());
        }
        // Another school's child: a different session, never this school's records.
        String rohan = api.parent("9876543210", "SJM-2033-0105");
        for (JsonNode r : api.getJson("/api/parent/fees/payments", rohan).get("payments")) assertEquals("SJM-2033-0105", r.get("studentId").asText());
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
