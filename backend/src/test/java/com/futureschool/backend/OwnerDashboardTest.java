package com.futureschool.backend;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
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

/** Owner's dashboard: who may see it, cash counted today, attendance counted from today's register, totals add up. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
class OwnerDashboardTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    Api api;

    @BeforeEach
    void setUp() {
        api = new Api(mvc, json);
    }

    private JsonNode gvs(JsonNode o) {
        for (JsonNode b : o.get("branches")) if (b.get("schoolId").asText().equals("GVS")) return b;
        fail("GVS branch missing: " + o);
        return null;
    }

    @Test
    void overviewCountsTodaysMoneyAndAttendanceForManagedBranchesOnly() throws Exception {
        String principal = api.staff("principal@greenwoodvalley.edu.in", "Greenwood@2026", "GVS");
        String finance = api.staff("admin@greenwoodvalley.edu.in", "Greenwood@2026", "GVS");
        String teacher = api.teacher("9848012345", "GVS");
        assertEquals(403, api.status("/api/owner/overview", teacher));

        JsonNode before = api.getJson("/api/owner/overview", principal);
        assertEquals(1, before.get("branches").size(), "the GVS Principal manages only GVS: " + before);
        long cashBefore = gvs(before).get("money").get("cashToday").asLong();
        long overdueBefore = gvs(before).get("money").get("overdue").asLong();

        JsonNode pay = api.post("/api/office/fees/cash", Map.of("studentId", "GVS-2027-0004", "amount", 2500, "note", "slip 9"), finance);
        assertEquals(200, pay.get("_status").asInt(), pay.toString());

        JsonNode after = api.getJson("/api/owner/overview", finance);
        JsonNode money = gvs(after).get("money");
        assertEquals(cashBefore + 2500, money.get("cashToday").asLong(), "cash received at the desk counts as cash today");
        assertTrue(money.get("overdue").asLong() <= overdueBefore, "paying never raises the overdue amount");
        assertEquals(money.get("cashToday").asLong(), after.get("totals").get("cashToday").asLong(), "one branch: totals equal the branch");

        Assumptions.assumeFalse(LocalDate.now(ZoneId.of("Asia/Kolkata")).getDayOfWeek() == DayOfWeek.SUNDAY, "no register on Sunday");
        Map<String, String> marks = new LinkedHashMap<>();
        for (String id : new String[]{"GVS-2027-0001", "GVS-2027-0002", "GVS-2027-0003", "GVS-2027-0004", "GVS-2027-0005", "GVS-2027-0006"}) marks.put(id, "P");
        marks.put("GVS-2027-0003", "A");
        String today = LocalDate.now(ZoneId.of("Asia/Kolkata")).toString();
        JsonNode reg = api.post("/api/staff/attendance/register",
                Map.of("classSectionId", "GVS-10-A", "date", today, "session", "MORNING", "marks", marks), teacher);
        assertEquals(200, reg.get("_status").asInt(), reg.toString());

        JsonNode att = gvs(api.getJson("/api/owner/overview", principal)).get("attendance");
        assertTrue(att.get("absent").asInt() >= 1, att.toString());
        assertTrue(att.get("present").asInt() >= 5, att.toString());
        for (JsonNode c : att.get("classesNotMarked")) assertNotEquals("10-A", c.asText(), "10-A saved its register today");
        assertEquals(att.get("students").asInt(),
                att.get("present").asInt() + att.get("absent").asInt() + att.get("onLeave").asInt() + att.get("notMarked").asInt());
    }
}
