package com.futureschool.backend;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.futureschool.backend.alerts.AlertDispatcher;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/** WhatsApp alerts: absence (held, cancelled by a correction, not for approved leave), fee reminders, opt-out, settings. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class AlertFlowTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired AlertDispatcher dispatcher;
    Api api;

    static final String[] TEN_A = {"GVS-2027-0001", "GVS-2027-0002", "GVS-2027-0003", "GVS-2027-0004", "GVS-2027-0005", "GVS-2027-0006"};
    static final String TODAY = LocalDate.now(ZoneId.of("Asia/Kolkata")).toString();

    @BeforeEach
    void setUp() {
        api = new Api(mvc, json);
    }

    private String sarah() throws Exception {
        return api.teacher("9848012345", "GVS");
    }

    private String principal() throws Exception {
        return api.staff("principal@greenwoodvalley.edu.in", "Greenwood@2026", "GVS");
    }

    private String finance() throws Exception {
        return api.staff("admin@greenwoodvalley.edu.in", "Greenwood@2026", "GVS");
    }

    private JsonNode save(String teacher, Map<String, String> marks, String reason) throws Exception {
        Map<String, Object> body = new HashMap<>(Map.of("classSectionId", "GVS-10-A", "date", TODAY, "session", "MORNING", "marks", marks));
        if (reason != null) body.put("correctionReason", reason);
        JsonNode r = api.post("/api/staff/attendance/register", body, teacher);
        assertEquals(200, r.get("_status").asInt(), r.toString());
        return r;
    }

    private JsonNode alertFor(JsonNode overview, String studentId, String kind) {
        for (JsonNode a : overview.get("recent")) if (a.get("studentId").asText().equals(studentId) && a.get("kind").asText().equals(kind)) return a;
        return null;
    }

    private static Map<String, String> allPresent() {
        Map<String, String> m = new LinkedHashMap<>();
        for (String id : TEN_A) m.put(id, "P");
        return m;
    }

    @Test
    @Order(1)
    void absenceAlertIsQueuedCancelledByCorrectionAndOnlyLoggedWithoutWhatsApp() throws Exception {
        Assumptions.assumeFalse(LocalDate.now(ZoneId.of("Asia/Kolkata")).getDayOfWeek() == DayOfWeek.SUNDAY, "no register on Sunday");
        String s = sarah();
        Map<String, String> marks = allPresent();
        marks.put("GVS-2027-0001", "A"); // Aarav: guardian Rajesh has a sign-in mobile
        marks.put("GVS-2027-0006", "A"); // on approved leave today: no alert
        marks.put("GVS-2027-0002", "A"); // no guardian mobile on record: skipped
        save(s, marks, null);

        String pr = principal();
        JsonNode o = api.getJson("/api/admin/alerts", pr);
        assertEquals("log", o.get("provider").asText());
        assertFalse(o.get("connected").asBoolean());
        JsonNode aarav = alertFor(o, "GVS-2027-0001", "ABSENT");
        assertNotNull(aarav, o.toString());
        assertEquals("QUEUED", aarav.get("status").asText());
        assertEquals("******3210", aarav.get("mobile").asText(), "masked guardian sign-in mobile");
        assertTrue(aarav.get("preview").asText().contains("Aarav Sharma"));
        assertNull(alertFor(o, "GVS-2027-0006", "ABSENT"), "approved leave sends nothing");
        assertEquals("SKIPPED", alertFor(o, "GVS-2027-0002", "ABSENT").get("status").asText());

        // Teacher fixes a wrong mark before the alert goes: it is cancelled.
        marks.put("GVS-2027-0001", "P");
        save(s, marks, "Aarav was in the library during roll call.");
        assertEquals("CANCELLED", alertFor(api.getJson("/api/admin/alerts", pr), "GVS-2027-0001", "ABSENT").get("status").asText());

        // Marked absent again: the same alert is queued again (never two alerts for one day).
        marks.put("GVS-2027-0001", "A");
        save(s, marks, "Aarav went home sick after roll call.");
        o = api.getJson("/api/admin/alerts", pr);
        assertEquals("QUEUED", alertFor(o, "GVS-2027-0001", "ABSENT").get("status").asText());
        long absentRows = 0;
        for (JsonNode a : o.get("recent")) if (a.get("studentId").asText().equals("GVS-2027-0001") && a.get("kind").asText().equals("ABSENT")) absentRows++;
        assertEquals(1, absentRows);

        // No WhatsApp connected: recorded as LOGGED, never claimed as sent.
        assertTrue(dispatcher.dispatchAll() >= 1);
        JsonNode after = alertFor(api.getJson("/api/admin/alerts", pr), "GVS-2027-0001", "ABSENT");
        assertEquals("LOGGED", after.get("status").asText());
        assertTrue(after.get("sentAt").isNull());
    }

    @Test
    @Order(2)
    void onlyAdminChangesSettingsAndAbsenceOffSendsNothing() throws Exception {
        assertEquals(403, api.post("/api/admin/alerts/settings", Map.of("absenceAlerts", false), principal()).get("_status").asInt());
        assertEquals(403, api.status("/api/admin/alerts", sarah()));
        JsonNode o = api.post("/api/admin/alerts/settings", Map.of("absenceAlerts", false), finance());
        assertFalse(o.get("absenceAlerts").asBoolean(), o.toString());
        assertTrue(o.get("feeReminders").asBoolean());

        Assumptions.assumeFalse(LocalDate.now(ZoneId.of("Asia/Kolkata")).getDayOfWeek() == DayOfWeek.SUNDAY, "no register on Sunday");
        Map<String, String> marks = allPresent();
        marks.put("GVS-2027-0001", "A");
        marks.put("GVS-2027-0003", "A");
        String reason = "Updated after the first period check.";
        Map<String, Object> body = new HashMap<>(Map.of("classSectionId", "GVS-10-A", "date", TODAY, "session", "MORNING", "marks", marks,
                "correctionReason", reason));
        api.post("/api/staff/attendance/register", body, sarah());
        assertNull(alertFor(api.getJson("/api/admin/alerts", principal()), "GVS-2027-0003", "ABSENT"), "absence alerts are off");
        api.post("/api/admin/alerts/settings", Map.of("absenceAlerts", true), finance());
    }

    @Test
    @Order(3)
    void parentOptOutAndFeeRemindersOncePerDay() throws Exception {
        String rajesh = api.parent("9876543210", "GVS-2027-0001");
        assertTrue(api.getJson("/api/parent/alerts/preference", rajesh).get("whatsappAlerts").asBoolean());
        assertFalse(api.post("/api/parent/alerts/preference", Map.of("whatsappAlerts", false), rajesh).get("whatsappAlerts").asBoolean());
        assertFalse(api.getJson("/api/parent/alerts/preference", rajesh).get("whatsappAlerts").asBoolean());
        assertEquals(403, api.status("/api/parent/alerts/preference", sarah()));

        assertEquals(403, api.post("/api/admin/alerts/fee-reminders", Map.of(), principal()).get("_status").asInt(), "Admin action");
        JsonNode first = api.post("/api/admin/alerts/fee-reminders", Map.of(), finance());
        assertEquals(200, first.get("_status").asInt(), first.toString());
        int total = first.get("queued").asInt() + first.get("skipped").asInt();
        assertTrue(first.get("note").asText().contains("not delivered"));
        JsonNode again = api.post("/api/admin/alerts/fee-reminders", Map.of(), finance());
        assertEquals(0, again.get("queued").asInt() + again.get("skipped").asInt());
        assertEquals(total, again.get("alreadyToday").asInt());

        JsonNode o = api.getJson("/api/admin/alerts", principal());
        for (JsonNode a : o.get("recent")) {
            if (a.get("kind").asText().equals("FEE_DUE") && a.get("studentId").asText().equals("GVS-2027-0001")) {
                assertEquals("SKIPPED", a.get("status").asText(), "Rajesh turned alerts off");
            }
        }
        api.post("/api/parent/alerts/preference", Map.of("whatsappAlerts", true), rajesh);
    }
}
