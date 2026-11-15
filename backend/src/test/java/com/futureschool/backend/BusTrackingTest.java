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
import org.springframework.test.web.servlet.MvcResult;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/** Driver link -> trip -> parent sees the bus only while live; positions cleared at the end; new link cancels the old. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
class BusTrackingTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    Api api;

    @BeforeEach
    void setUp() {
        api = new Api(mvc, json);
    }

    private JsonNode publicGet(String url) throws Exception {
        MvcResult r = mvc.perform(get(url)).andReturn();
        JsonNode n = json.readTree(r.getResponse().getContentAsString());
        ((com.fasterxml.jackson.databind.node.ObjectNode) n).put("_status", r.getResponse().getStatus());
        return n;
    }

    @Test
    void driverLinkTripAndParentLiveView() throws Exception {
        String ops = api.staff("office@greenwoodvalley.edu.in", "Greenwood@2026", "GVS");
        String finance = api.staff("admin@greenwoodvalley.edu.in", "Greenwood@2026", "GVS");
        assertEquals(403, api.post("/api/office/bus/routes/Route 4/driver-link", Map.of(), finance).get("_status").asInt(), "needs TRANSPORT");

        JsonNode link = api.post("/api/office/bus/routes/Route 4/driver-link", Map.of(), ops);
        assertEquals(200, link.get("_status").asInt(), link.toString());
        String token = link.get("token").asText();
        String base = "/api/public/bus/" + token;

        assertEquals(404, publicGet("/api/public/bus/not-a-real-token-at-all-xyz").get("_status").asInt());
        JsonNode view = publicGet(base);
        assertEquals("Route 4 · Kondapur", view.get("routeName").asText());
        assertFalse(view.has("trip"));

        String aarav = api.parent("9876543210", "GVS-2027-0001"); // rides Route 4, stop Kondapur X Roads
        JsonNode before = api.getJson("/api/parent/bus/live", aarav);
        assertTrue(before.get("usesTransport").asBoolean());
        assertFalse(before.has("trip"), "no trip yet: " + before);

        assertEquals("NO_TRIP", api.post(base + "/ping", Map.of("lat", 17.46, "lng", 78.36), null).get("code").asText());
        api.post(base + "/start", Map.of("direction", "PICKUP"), null);
        assertEquals("BAD_POSITION", api.post(base + "/ping", Map.of("lat", 123, "lng", 78.36), null).get("code").asText());
        api.post(base + "/ping", Map.of("lat", 17.4636, "lng", 78.3647, "accuracy", 12), null);

        JsonNode live = api.getJson("/api/parent/bus/live", aarav);
        assertEquals("PICKUP", live.get("trip").get("direction").asText());
        assertEquals(17.4636, live.get("trip").get("lat").asDouble(), 1e-9);
        assertFalse(live.get("trip").get("stale").asBoolean());
        assertFalse(live.get("trip").has("distanceKm"), "stop has no saved position yet");

        // The driver saves the first stop (Kondapur X Roads) where the bus stands; parents now get a distance.
        api.post(base + "/stops/0/here", Map.of("lat", 17.4700, "lng", 78.3647), null);
        JsonNode withStop = api.getJson("/api/parent/bus/live", aarav);
        assertTrue(withStop.get("trip").get("distanceKm").asDouble() > 0.5, withStop.toString());

        JsonNode office = api.getJson("/api/office/bus/live", ops);
        boolean seen = false;
        for (JsonNode r : office) if (r.get("routeId").asText().equals("Route 4")) seen = r.has("trip") && r.get("hasDriverLink").asBoolean();
        assertTrue(seen, office.toString());

        api.post(base + "/end", Map.of(), null);
        assertFalse(api.getJson("/api/parent/bus/live", aarav).has("trip"), "nothing shown once the trip ends");

        // A new link cancels the old one.
        api.post("/api/office/bus/routes/Route 4/driver-link", Map.of(), ops);
        assertEquals(404, publicGet(base).get("_status").asInt());

        // A child without school transport sees no bus.
        JsonNode rohan = api.getJson("/api/parent/bus/live", api.parent("9876543210", "SJM-2033-0105"));
        assertFalse(rohan.get("usesTransport").asBoolean());
    }
}
