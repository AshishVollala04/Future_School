package com.futureschool.backend;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

/** Each school reports its own board; the CBSE demo school uses CBSE exam names and the 33% pass mark. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
class BoardProfileTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    Api api;

    @BeforeEach
    void setUp() {
        api = new Api(mvc, json);
    }

    @Test
    void eachSchoolCarriesItsBoardAndCbseResultsUseCbseRules() throws Exception {
        String gvsParent = api.parent("9876543210", "GVS-2027-0001");
        assertEquals("TELANGANA_SSC", api.getJson("/api/schools/current", gvsParent).get("boardProfileId").asText());

        String sjmParent = api.parent("9876543210", "SJM-2033-0105");
        assertEquals("CBSE", api.getJson("/api/schools/current", sjmParent).get("boardProfileId").asText());

        JsonNode results = api.getJson("/api/parent/results", sjmParent);
        Set<String> exams = new HashSet<>();
        String today = LocalDate.now(ZoneId.of("Asia/Kolkata")).toString();
        for (JsonNode r : results) {
            exams.add(r.get("examName").asText());
            assertTrue(r.get("publishedOn").asText().compareTo(today) <= 0, "no result is published for a future date: " + r);
            for (JsonNode s : r.get("subjects")) {
                int max = s.get("maxInternal").asInt() + s.get("maxExternal").asInt();
                assertEquals(Math.round(max * 0.33), s.get("passMark").asInt(), 1, "CBSE pass mark is 33%: " + s);
            }
        }
        assertEquals(Set.of("PT-1", "Half-Yearly"), exams);

        JsonNode tickets = api.getJson("/api/parent/hall-tickets", sjmParent);
        boolean halfYearly = false;
        for (JsonNode t : tickets) if (t.toString().contains("Half-Yearly")) halfYearly = true;
        assertTrue(halfYearly, "St. Jude's exam window is the CBSE Half-Yearly: " + tickets);
    }
}
