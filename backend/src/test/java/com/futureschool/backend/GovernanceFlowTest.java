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

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Governance (Admin drafts -> Principal approves with OTP -> Admin executes, blocked if edited after
 * approval), published-mark corrections (versioned), and the office fee desk, checked through the
 * parent app where it matters.
 * admin@ = S. Sundaram (FINANCE...), office@ = Priya Narayanan (ACADEMIC_OPS...).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class GovernanceFlowTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    Api api;

    @BeforeEach
    void setUp() {
        api = new Api(mvc, json);
    }

    private String finance() throws Exception {
        return api.staff("admin@greenwoodvalley.edu.in", "Greenwood@2026", "GVS");
    }

    private String ops() throws Exception {
        return api.staff("office@greenwoodvalley.edu.in", "Greenwood@2026", "GVS");
    }

    private String principal() throws Exception {
        return api.staff("principal@greenwoodvalley.edu.in", "Greenwood@2026", "GVS");
    }

    private String stepUp(String token) throws Exception {
        JsonNode c = api.post("/api/auth/step-up/request", Map.of("purpose", "SENSITIVE_STAFF_ACTION"), token);
        return api.post("/api/auth/step-up/verify", Map.of("challengeId", c.get("challengeId").asText(), "code", c.get("devCode").asText()), token)
                .get("stepUpToken").asText();
    }

    private JsonNode request(String token, String id) throws Exception {
        for (JsonNode r : api.getJson("/api/governance/admin", token)) if (r.get("id").asText().equals(id)) return r;
        return null;
    }

    private long kavyaConcession() throws Exception {
        return api.getJson("/api/parent/fees/summary", api.parent("9848011111", "GVS-2028-0117")).get("totalConcession").asLong();
    }

    @Test
    @Order(1)
    void permissionsAndRolesAreEnforced() throws Exception {
        String f = finance(), o = ops(), p = principal();
        Map<String, Object> concession = Map.of("title", "x", "payload", Map.of("kind", "FEE_CONCESSION", "studentId", "GVS-2028-0117",
                "chargeIds", List.of("GVS-2028-0117-SF-3"), "amountPerCharge", 100, "concessionKind", "OTHER", "justification", "Testing permissions here"));
        assertEquals(403, api.post("/api/governance/drafts", concession, o).get("_status").asInt(), "ops admin has no FINANCE");
        assertEquals(403, api.post("/api/governance/CR-GVS-3/execute", Map.of(), f).get("_status").asInt(), "finance admin has no ACADEMIC_OPS");
        assertEquals(403, api.post("/api/governance/CR-GVS-1/decision", Map.of("decision", "APPROVE"), f).get("_status").asInt(), "Admin cannot approve");
        assertEquals(403, api.post("/api/governance/CR-GVS-3/execute", Map.of(), p).get("_status").asInt(), "Principal cannot execute");
        assertEquals(403, api.status("/api/governance/admin", api.teacher("9848012345", "GVS")));
        JsonNode list = api.getJson("/api/governance/principal", p);
        assertEquals(3, list.size(), "the draft is not shown to the Principal");
        assertTrue(list.get(0).get("description").size() > 0);
    }

    @Test
    @Order(2)
    void approvedExamChangeIsExecutedByTheRightAdmin() throws Exception {
        JsonNode r = api.post("/api/governance/CR-GVS-3/execute", Map.of(), ops());
        assertEquals("EXECUTED", r.get("status").asText(), r.toString());
        JsonNode ticket = api.getJson("/api/parent/hall-tickets", api.parent("9876543210", "GVS-2027-0001")).get(0);
        String expectedDate = java.time.LocalDate.now(com.futureschool.backend.parent.ParentDataService.SCHOOL_ZONE).plusDays(9).toString();
        assertEquals(expectedDate, ticket.get("exam").get("startsOn").asText());
    }

    @Test
    @Order(3)
    void editingAfterApprovalBlocksExecutionUntilReapproved() throws Exception {
        String f = finance(), p = principal();
        long before = kavyaConcession();
        assertEquals("STEP_UP_REQUIRED", api.post("/api/governance/CR-GVS-1/decision", Map.of("decision", "APPROVE"), p).get("code").asText());
        assertEquals("REASON", api.post("/api/governance/CR-GVS-2/decision", Map.of("decision", "RETURN", "note", ""), p).get("code").asText());
        assertEquals("APPROVED", api.post("/api/governance/CR-GVS-1/decision", Map.of("decision", "APPROVE", "stepUpToken", stepUp(p)), p).get("status").asText());

        @SuppressWarnings("unchecked")
        Map<String, Object> payload = json.convertValue(request(f, "CR-GVS-1").get("payload"), Map.class);
        payload.put("amountPerCharge", 3000);
        JsonNode edited = api.post("/api/governance/CR-GVS-1/edit", Map.of("payload", payload), f);
        assertTrue(edited.get("history").toString().contains("EDITED_AFTER_APPROVAL"));
        JsonNode blocked = api.post("/api/governance/CR-GVS-1/execute", Map.of(), f);
        assertEquals("CHANGED_AFTER_APPROVAL", blocked.get("code").asText(), blocked.toString());
        assertEquals("EXECUTION_BLOCKED", request(f, "CR-GVS-1").get("status").asText(), "blocked state must be saved");
        assertEquals(before, kavyaConcession(), "nothing applied while blocked");

        assertEquals("PENDING_APPROVAL", api.post("/api/governance/CR-GVS-1/submit", Map.of(), f).get("status").asText());
        api.post("/api/governance/CR-GVS-1/decision", Map.of("decision", "APPROVE", "stepUpToken", stepUp(p)), p);
        assertEquals("EXECUTED", api.post("/api/governance/CR-GVS-1/execute", Map.of(), f).get("status").asText());
        assertEquals(before + 6000, kavyaConcession(), "parent sees the executed concession");
    }

    @Test
    @Order(4)
    void refundIsASeparateRecordAndTheOriginalPaymentIsKept() throws Exception {
        String f = finance(), p = principal();
        api.post("/api/governance/CR-GVS-2/decision", Map.of("decision", "APPROVE", "stepUpToken", stepUp(p)), p);
        assertEquals("EXECUTED", api.post("/api/governance/CR-GVS-2/execute", Map.of(), f).get("status").asText());
        JsonNode acct = api.getJson("/api/office/fees/account?studentId=GVS-2027-0002", f);
        assertEquals(1, acct.get("refunds").size());
        assertEquals(1500, acct.get("refunds").get(0).get("amount").asLong());
        assertEquals("PAY-GVS-1006", acct.get("refunds").get(0).get("paymentId").asText());
        assertTrue(acct.get("payments").toString().contains("GVS/2026-27/1006"));

        // A second refund larger than what is left is rejected by validation.
        Map<String, Object> tooMuch = Map.of("title", "Refund again", "payload",
                Map.of("kind", "REFUND", "paymentId", "PAY-GVS-1006", "amount", 999999, "reason", "Testing the refund limit"));
        JsonNode draft = api.post("/api/governance/drafts", tooMuch, f);
        assertTrue(draft.get("validationIssues").size() > 0);
        assertEquals("INVALID", api.post("/api/governance/" + draft.get("id").asText() + "/submit", Map.of(), f).get("code").asText());
        assertEquals("PENDING_APPROVAL", api.post("/api/governance/CR-GVS-4/submit", Map.of(), f).get("status").asText());
    }

    @Test
    @Order(5)
    void correctionsAreVersionedNeverOverwritten() throws Exception {
        String p = principal(), sarah = api.teacher("9848012345", "GVS"), nair = api.teacher("9848022222", "GVS");
        assertEquals("STEP_UP_REQUIRED", api.post("/api/corrections/MC-GVS-1/decision", Map.of("decision", "APPROVE"), p).get("code").asText());
        assertEquals("APPROVED", api.post("/api/corrections/MC-GVS-1/decision", Map.of("decision", "APPROVE", "stepUpToken", stepUp(p)), p).get("status").asText());
        assertEquals(403, api.post("/api/corrections/MC-GVS-1/republish", Map.of(), nair).get("_status").asInt(), "only the Class Teacher republishes");
        assertEquals(403, api.post("/api/corrections/MC-GVS-1/republish", Map.of(), p).get("_status").asInt());
        JsonNode v3 = api.post("/api/corrections/MC-GVS-1/republish", Map.of(), sarah);
        assertEquals(3, v3.get("version").asInt(), v3.toString());

        String parent = api.parent("9876543210", "GVS-2027-0001");
        JsonNode results = api.getJson("/api/parent/results", parent);
        List<String> fa1 = new ArrayList<>();
        JsonNode fa1Current = null;
        for (JsonNode r : results) if (r.get("examName").asText().equals("FA-1")) {
            fa1.add("v" + r.get("version").asInt() + ":" + r.get("status").asText());
            if ("CURRENT".equals(r.get("status").asText())) fa1Current = r;
        }
        assertEquals(List.of("v3:CURRENT", "v2:SUPERSEDED", "v1:SUPERSEDED"), fa1);
        assertNotNull(fa1Current);
        for (JsonNode s : fa1Current.get("subjects")) if (s.get("subject").asText().equals("Social Studies")) assertEquals(17, s.get("internal").asInt());

        // A new correction on the new current version.
        Map<String, Object> raise = new HashMap<>(Map.of("resultId", "RES-GVS-AARAV-FA1-v3", "subject", "Mathematics", "field", "internal", "to", 19,
                "reason", "Re-checked question 4; one mark was missed."));
        assertEquals(403, api.post("/api/corrections", raise, sarah).get("_status").asInt(), "only the subject teacher raises");
        JsonNode mc = api.post("/api/corrections", raise, nair);
        assertEquals("RAISED", mc.get("status").asText(), mc.toString());
        assertEquals("OPEN", api.post("/api/corrections", raise, nair).get("code").asText());
        Map<String, Object> bad = new HashMap<>(raise);
        bad.put("subject", "Physical Science");
        bad.put("to", 25);
        assertEquals("INVALID", api.post("/api/corrections", bad, sarah).get("code").asText());
        bad.put("to", 8);
        assertEquals("SAME", api.post("/api/corrections", bad, sarah).get("code").asText());
        bad.put("to", "AB");
        JsonNode own = api.post("/api/corrections", bad, sarah);
        assertEquals("SAME_PERSON", api.post("/api/corrections/" + own.get("id").asText() + "/verify", Map.of("decision", "VERIFY"), sarah).get("code").asText());
        assertEquals("VERIFIED", api.post("/api/corrections/" + mc.get("id").asText() + "/verify", Map.of("decision", "VERIFY", "note", ""), sarah).get("status").asText());
        assertTrue(api.getJson("/api/corrections/correctable", nair).toString().contains("\"openCorrection\":\"VERIFIED\""));
    }

    @Test
    @Order(6)
    void officeFeeDeskRecordsCashForFinanceOnly() throws Exception {
        String f = finance();
        assertEquals(403, api.status("/api/office/fees/students", ops()));
        assertEquals(403, api.status("/api/office/fees/students", principal()));
        JsonNode rows = api.getJson("/api/office/fees/students?q=Devansh", f);
        assertEquals(1, rows.size());
        long before = rows.get(0).get("outstanding").asLong();
        JsonNode pay = api.post("/api/office/fees/cash", Map.of("studentId", "GVS-2027-0004", "amount", 5000, "note", "slip 12"), f);
        assertEquals("CASH_AT_OFFICE", pay.get("method").asText(), pay.toString());
        assertEquals("ACC-L-0002", pay.get("recordedByStaffId").asText());
        assertEquals(before - 5000, api.getJson("/api/office/fees/students?q=Devansh", f).get(0).get("outstanding").asLong());
        assertEquals("BAD_AMOUNT", api.post("/api/office/fees/cash", Map.of("studentId", "GVS-2027-0004", "amount", 99_999_999), f).get("code").asText());
        assertEquals(403, api.post("/api/office/fees/cash", Map.of("studentId", "SJM-2033-0105", "amount", 100), f).get("_status").asInt(), "other school's student");
    }
}
