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

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Flow 1 (student leave -> Class Teacher -> register context) and Flow 6 (teacher leave -> Principal
 * -> Admin substitution -> substitute's duty), plus timetables, on the backend.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class LeaveFlowTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    Api api;

    static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    @BeforeEach
    void setUp() {
        api = new Api(mvc, json);
    }

    static String days(int n) {
        return LocalDate.now(IST).plusDays(n).toString();
    }

    private String sarah() throws Exception {
        return api.teacher("9848012345", "GVS");
    }

    @Test
    @Order(1)
    void parentAppliesAndTheRulesHold() throws Exception {
        String p = api.parent("9876543210", "GVS-2027-0001");
        JsonNode list = api.getJson("/api/parent/leave", p);
        assertEquals("PENDING", list.get(0).get("status").asText());
        Map<String, Object> req = new HashMap<>(Map.of("fromDate", days(1), "toDate", days(1), "kind", "SICK", "reason", "Fever since last night."));
        assertEquals("OVERLAP", api.post("/api/parent/leave", req, p).get("code").asText());
        req.put("fromDate", days(-10));
        req.put("toDate", days(-10));
        assertEquals("DATES", api.post("/api/parent/leave", req, p).get("code").asText());
        req.put("fromDate", days(3));
        req.put("toDate", days(23));
        assertEquals("DATES", api.post("/api/parent/leave", req, p).get("code").asText());
        req.put("toDate", days(3));
        JsonNode ok = api.post("/api/parent/leave", req, p);
        assertEquals("PENDING", ok.get("status").asText(), ok.toString());
        assertEquals("GVS-2027-0001", ok.get("studentId").asText());
        assertEquals("WITHDRAWN", api.post("/api/parent/leave/" + ok.get("id").asText() + "/withdraw", Map.of(), p).get("status").asText());
        // Another parent's session cannot touch it.
        String kavya = api.parent("9848011111", "GVS-2028-0117");
        assertEquals(403, api.post("/api/parent/leave/" + list.get(0).get("id").asText() + "/withdraw", Map.of(), kavya).get("_status").asInt());
    }

    @Test
    @Order(2)
    void classTeacherDecidesAndTheRegisterShowsContextOnly() throws Exception {
        String s = sarah();
        assertEquals(403, api.status("/api/staff/leave/class?classId=GVS-10-A", api.teacher("9848022222", "GVS")));
        JsonNode list = api.getJson("/api/staff/leave/class?classId=GVS-10-A", s);
        assertTrue(list.size() >= 2);
        String aaravLeave = null;
        for (JsonNode l : list) if (l.get("studentId").asText().equals("GVS-2027-0001") && l.get("status").asText().equals("PENDING")) aaravLeave = l.get("id").asText();
        assertNotNull(aaravLeave);
        assertEquals("REASON", api.post("/api/staff/leave/" + aaravLeave + "/decision", Map.of("decision", "REJECTED", "note", ""), s).get("code").asText());
        JsonNode d = api.post("/api/staff/leave/" + aaravLeave + "/decision", Map.of("decision", "APPROVED", "note", "Get well soon."), s);
        assertEquals("APPROVED", d.get("status").asText());
        assertEquals("Sarah Jenkins", d.get("decision").get("byName").asText());
        assertEquals("STATE", api.post("/api/staff/leave/" + aaravLeave + "/decision", Map.of("decision", "REJECTED", "note", "Changed my mind"), s).get("code").asText());

        JsonNode parentView = api.getJson("/api/parent/leave", api.parent("9876543211", "GVS-2027-0001"));
        assertTrue(parentView.toString().contains("Get well soon."));

        // Register for tomorrow: Aarav and Arif carry approved-leave context, but nothing is marked automatically.
        JsonNode reg = api.getJson("/api/staff/attendance/register?classId=GVS-10-A&date=" + days(1) + "&session=MORNING", s);
        Map<String, JsonNode> rows = new HashMap<>();
        reg.get("rows").forEach(r -> rows.put(r.get("studentId").asText(), r));
        assertEquals("MEDICAL_APPOINTMENT", rows.get("GVS-2027-0001").get("leave").get("kind").asText());
        assertEquals("FAMILY", rows.get("GVS-2027-0006").get("leave").get("kind").asText());
        assertTrue(rows.get("GVS-2027-0001").get("mark").isNull(), "leave must never mark attendance by itself");
        assertFalse(rows.get("GVS-2027-0002").has("leave"));
    }

    @Test
    @Order(3)
    void timetablesFollowTheClassAndTheTeacher() throws Exception {
        JsonNode tt = api.getJson("/api/parent/timetable", api.parent("9876543210", "GVS-2027-0001"));
        assertEquals(5 * 6 + 4, tt.size());
        JsonNode first = tt.get(0);
        assertEquals(1, first.get("day").asInt());
        assertEquals(1, first.get("period").asInt());
        // Same rotation as the frontend seed (per-class offset, skipping busy teachers) -> English on Monday P1.
        assertEquals("English", first.get("subject").asText());
        assertEquals("P. Ramesh", first.get("teacherName").asText());

        JsonNode mine = api.getJson("/api/staff/my-periods?day=1", sarah());
        assertTrue(mine.size() > 0);
        for (JsonNode m : mine) assertEquals("Physical Science", m.get("subject").asText());
        // A teacher is never in two classes at the same time, on any day.
        for (int day = 1; day <= 6; day++) {
            java.util.Set<String> starts = new java.util.HashSet<>();
            for (JsonNode m : api.getJson("/api/staff/my-periods?day=" + day, sarah()))
                assertTrue(starts.add(m.get("start").asText()), "Sarah double-booked on day " + day + " at " + m.get("start").asText());
        }
        assertEquals(0, api.getJson("/api/staff/my-periods?day=7", sarah()).size());
    }

    @Test
    @Order(4)
    void teacherLeaveThenPrincipalThenAdminSubstitution() throws Exception {
        String s = sarah(), principal = api.staff("principal@greenwoodvalley.edu.in", "Greenwood@2026", "GVS");
        String ops = api.staff("office@greenwoodvalley.edu.in", "Greenwood@2026", "GVS");
        String finance = api.staff("admin@greenwoodvalley.edu.in", "Greenwood@2026", "GVS");

        JsonNode mine = api.post("/api/staff/my-leave", Map.of("fromDate", days(20), "toDate", days(20), "kind", "CASUAL", "reason", "Family function."), s);
        assertEquals("PENDING", mine.get("status").asText(), mine.toString());
        assertEquals("OVERLAP", api.post("/api/staff/my-leave", Map.of("fromDate", days(20), "toDate", days(21), "kind", "CASUAL", "reason", "Again."), s).get("code").asText());
        assertEquals(403, api.post("/api/staff/teacher-leave/" + mine.get("id").asText() + "/decision", Map.of("decision", "APPROVED"), ops).get("_status").asInt());
        assertEquals("APPROVED", api.post("/api/staff/teacher-leave/" + mine.get("id").asText() + "/decision", Map.of("decision", "APPROVED"), principal).get("status").asText());

        assertEquals(403, api.status("/api/staff/substitution", finance), "needs ACADEMIC_OPS");
        JsonNode needs = api.getJson("/api/staff/substitution", ops);
        JsonNode lakshmi = null;
        for (JsonNode n : needs) if (n.get("absentName").asText().equals("K. Lakshmi")) { lakshmi = n; break; }
        assertNotNull(lakshmi, "approved leave for K. Lakshmi needs cover");
        assertEquals("Telugu", lakshmi.get("subject").asText());
        for (JsonNode f : lakshmi.get("freeTeachers")) assertNotEquals("STF-T-0003", f.get("staffId").asText(), "the absent teacher is never offered");

        Map<String, Object> assign = new HashMap<>(Map.of("leaveId", lakshmi.get("leaveId").asText(), "date", lakshmi.get("date").asText(),
                "classSectionId", lakshmi.get("classSectionId").asText(), "period", lakshmi.get("period").asInt(), "substituteStaffId", "STF-T-0003"));
        assertEquals("NOT_FREE", api.post("/api/staff/substitution", assign, ops).get("code").asText());
        String free = lakshmi.get("freeTeachers").get(0).get("staffId").asText();
        String freeName = lakshmi.get("freeTeachers").get(0).get("name").asText();
        boolean sarahFree = false;
        for (JsonNode f : lakshmi.get("freeTeachers")) if (f.get("staffId").asText().equals("STF-T-0001")) sarahFree = true;
        if (sarahFree) {
            free = "STF-T-0001";
            freeName = "Sarah Jenkins";
        }
        assign.put("substituteStaffId", free);
        JsonNode slot = api.post("/api/staff/substitution", assign, ops);
        assertEquals(freeName, slot.get("substituteName").asText(), slot.toString());

        JsonNode after = api.getJson("/api/staff/substitution", ops);
        for (JsonNode n : after) {
            if (n.get("leaveId").asText().equals(lakshmi.get("leaveId").asText()) && n.get("date").asText().equals(lakshmi.get("date").asText())
                    && n.get("period").asInt() == lakshmi.get("period").asInt() && n.get("classSectionId").asText().equals(lakshmi.get("classSectionId").asText())) {
                assertEquals(free, n.get("assigned").get("substituteStaffId").asText());
            }
        }
        if (sarahFree) {
            JsonNode duties = api.getJson("/api/staff/substitution/my-duties", s);
            assertTrue(duties.toString().contains(lakshmi.get("date").asText()), duties.toString());
        }
        // Pending leave (Nair) is not offered for substitution.
        for (JsonNode n : after) assertNotEquals("Raghavan Nair", n.get("absentName").asText());
        JsonNode staffLeave = api.getJson("/api/staff/teacher-leave", principal);
        assertTrue(staffLeave.toString().contains("\"arrangedBy\":\"ACC-L-0003\""));
    }
}
