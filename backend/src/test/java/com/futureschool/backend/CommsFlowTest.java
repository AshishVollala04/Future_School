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

/** Notices, messages (allowed recipients only), consent (final), meetings and homework on the backend. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class CommsFlowTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    Api api;

    @BeforeEach
    void setUp() {
        api = new Api(mvc, json);
    }

    static String day(int n) {
        return LocalDate.now(ZoneId.of("Asia/Kolkata")).plusDays(n).toString();
    }

    private List<String> titles(JsonNode arr, String field) {
        List<String> out = new ArrayList<>();
        arr.forEach(n -> out.add(n.get(field).asText()));
        return out;
    }

    @Test
    @Order(1)
    void noticesFollowTheAudienceAndTheSender() throws Exception {
        JsonNode aarav = api.getJson("/api/parent/notices", api.parent("9876543210", "GVS-2027-0001"));
        assertEquals("Heavy rain alert: early dismissal today", aarav.get(0).get("title").asText(), "emergency first");
        assertFalse(titles(aarav, "title").contains("Class 6-B: science exhibition"), "another class's notice leaked");
        assertTrue(titles(api.getJson("/api/parent/notices", api.parent("9876543210", "GVS-2031-0042")), "title").contains("Class 6-B: science exhibition"));
        assertFalse(titles(api.getJson("/api/parent/notices", api.parent("9876543210", "SJM-2033-0105")), "title").contains("SA-1 timetable published"), "other school");

        String sarah = api.teacher("9848012345", "GVS");
        Map<String, Object> toMyClass = Map.of("audience", List.of("GVS-10-A"), "title", "Bring lab coats", "body", "Physics practical on Thursday.", "priority", "NORMAL");
        assertEquals(200, api.post("/api/staff/notices", toMyClass, sarah).get("_status").asInt());
        assertEquals(403, api.post("/api/staff/notices", Map.of("audience", List.of("GVS-6-B"), "title", "x title", "body", "Not my class."), sarah).get("_status").asInt());
        assertEquals(403, api.post("/api/staff/notices", Map.of("audience", List.of("ALL"), "title", "School notice", "body", "Whole school."), sarah).get("_status").asInt());
        assertEquals(403, api.post("/api/staff/notices", Map.of("audience", List.of("GVS-10-A"), "title", "Alert", "body", "Emergency!", "priority", "EMERGENCY"), sarah).get("_status").asInt());
        String principal = api.staff("principal@greenwoodvalley.edu.in", "Greenwood@2026", "GVS");
        assertEquals(200, api.post("/api/staff/notices", Map.of("audience", List.of("ALL"), "title", "PTM on Saturday", "body", "All parents are invited.", "priority", "IMPORTANT"), principal).get("_status").asInt());
        assertTrue(titles(api.getJson("/api/parent/notices", api.parent("9876543211", "GVS-2027-0001")), "title").containsAll(List.of("Bring lab coats", "PTM on Saturday")));
    }

    @Test
    @Order(2)
    void parentsMessageOnlyTheirChildsTeachersAndTeachersReply() throws Exception {
        String parent = api.parent("9876543210", "GVS-2027-0001");
        JsonNode rec = api.getJson("/api/parent/messages/recipients", parent);
        assertEquals("STF-T-0001", rec.get(0).get("staffId").asText());
        assertTrue(rec.get(0).get("role").asText().startsWith("Class Teacher"));
        assertTrue(rec.get(0).get("role").asText().contains("Physical Science"));
        assertFalse(rec.toString().contains("STF-T-0008"), "T. Padma does not teach 10-A");

        assertEquals(403, api.post("/api/parent/messages", Map.of("staffId", "STF-T-0008", "category", "GENERAL", "subject", "Hi", "body", "Hello"), parent).get("_status").asInt());
        JsonNode th = api.post("/api/parent/messages", Map.of("staffId", "STF-T-0002", "category", "HOMEWORK", "subject", "Exercise 5.2", "body", "Aarav found Q7 hard."), parent);
        assertEquals("Raghavan Nair", th.get("teacherName").asText(), th.toString());
        assertEquals("TOO_LONG", api.post("/api/parent/messages/" + th.get("id").asText() + "/reply", Map.of("body", "x".repeat(1001)), parent).get("code").asText());

        String nair = api.teacher("9848022222", "GVS");
        JsonNode inbox = api.getJson("/api/staff/messages", nair);
        assertTrue(titles(inbox, "subject").contains("Exercise 5.2"));
        assertFalse(titles(inbox, "subject").contains("Late arrival on Monday"), "Sarah's thread is not in Nair's inbox");
        JsonNode replied = api.post("/api/staff/messages/" + th.get("id").asText() + "/reply", Map.of("body", "We will go over it on Monday."), nair);
        assertEquals("TEACHER", replied.get("messages").get(1).get("from").asText());
        assertEquals(403, api.post("/api/staff/messages/TH-GVS-1/reply", Map.of("body", "Not mine"), nair).get("_status").asInt());

        JsonNode mine = api.getJson("/api/parent/messages", api.parent("9876543211", "GVS-2027-0001"));
        assertEquals("Exercise 5.2", mine.get(0).get("subject").asText(), "newest first, visible to both guardians");
        assertEquals(0, api.getJson("/api/parent/messages", api.parent("9876543210", "GVS-2031-0042")).size(), "another child's threads stay out");
    }

    @Test
    @Order(3)
    void consentIsFinalAndAttributable() throws Exception {
        String rajesh = api.parent("9876543210", "GVS-2027-0001");
        JsonNode list = api.getJson("/api/parent/consents", rajesh);
        assertEquals(1, list.size());
        assertFalse(list.get(0).has("response"));
        JsonNode r = api.post("/api/parent/consents/CN-GVS-1", Map.of("decision", "DECLINED"), rajesh);
        assertEquals("DECLINED", r.get("response").get("decision").asText());
        assertEquals("GRD-0001", r.get("response").get("guardianId").asText());
        String meena = api.parent("9876543211", "GVS-2027-0001");
        assertEquals("ALREADY_RESPONDED", api.post("/api/parent/consents/CN-GVS-1", Map.of("decision", "GIVEN"), meena).get("code").asText(),
                "Declined can never become Approved from the app");
        assertEquals(403, api.post("/api/parent/consents/CN-GVS-1", Map.of("decision", "GIVEN"), api.parent("9876543210", "GVS-2031-0042")).get("_status").asInt(),
                "6-B is not invited");
    }

    @Test
    @Order(4)
    void homeworkIsPostedByTheSubjectTeacherAndStatusIsPerStudent() throws Exception {
        String parent = api.parent("9876543210", "GVS-2027-0001");
        JsonNode hw = api.getJson("/api/parent/homework", parent);
        assertTrue(hw.get(0).get("overdue").asBoolean(), "overdue first");
        assertEquals("HW-GVS-1", hw.get(0).get("id").asText());

        String sarah = api.teacher("9848012345", "GVS");
        Map<String, Object> post = new HashMap<>(Map.of("classSectionId", "GVS-10-A", "subject", "Mathematics", "title", "Not my subject", "dueOn", day(3)));
        assertEquals(403, api.post("/api/staff/homework", post, sarah).get("_status").asInt());
        post.put("subject", "Physical Science");
        post.put("dueOn", day(-1));
        assertEquals("DATES", api.post("/api/staff/homework", post, sarah).get("code").asText());
        post.put("dueOn", day(3));
        post.put("title", "Ohm's law: 5 numericals");
        JsonNode created = api.post("/api/staff/homework", post, sarah);
        assertEquals("Sarah Jenkins", created.get("teacherName").asText(), created.toString());

        String id = created.get("id").asText();
        assertEquals("CHECKED", api.post("/api/staff/homework/" + id + "/status", Map.of("studentId", "GVS-2027-0001", "status", "CHECKED"), sarah).get("status").asText());
        assertEquals(403, api.post("/api/staff/homework/" + id + "/status", Map.of("studentId", "GVS-2027-0001", "status", "PENDING"), api.teacher("9848022222", "GVS")).get("_status").asInt());
        assertEquals(403, api.post("/api/staff/homework/" + id + "/status", Map.of("studentId", "GVS-2028-0117", "status", "CHECKED"), sarah).get("_status").asInt(), "not in this class");

        JsonNode after = api.getJson("/api/parent/homework", parent);
        JsonNode mine = null;
        for (JsonNode h : after) if (h.get("id").asText().equals(id)) mine = h;
        assertNotNull(mine);
        assertEquals("CHECKED", mine.get("status").asText());
        assertEquals("PENDING", findStatus(api.getJson("/api/staff/homework", sarah), id, "GVS-2027-0002"));
        assertTrue(api.getJson("/api/parent/meetings", parent).get(0).get("purpose").asText().contains("SA-1"));
    }

    private static String findStatus(JsonNode list, String hwId, String studentId) {
        for (JsonNode h : list) {
            if (!h.get("id").asText().equals(hwId)) continue;
            for (JsonNode s : h.get("students")) if (s.get("id").asText().equals(studentId)) return s.get("status").asText();
        }
        return null;
    }
}
