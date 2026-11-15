package com.futureschool.backend.init;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.futureschool.backend.entity.*;
import com.futureschool.backend.parent.ParentDataService;
import com.futureschool.backend.repository.*;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.*;

/** Development seed: bus routes, riders' stops, Kavya's transport request and one open complaint (as the prototype). */
@Component
public class OfficeSeed {

    private final BusRouteRepository routes;
    private final TransportRequestRepository requests;
    private final ComplaintCaseRepository complaints;
    private final StudentRepository students;
    private final ObjectMapper json;

    public OfficeSeed(BusRouteRepository routes, TransportRequestRepository requests, ComplaintCaseRepository complaints, StudentRepository students, ObjectMapper json) {
        this.routes = routes;
        this.requests = requests;
        this.complaints = complaints;
        this.students = students;
        this.json = json;
    }

    private String w(Object o) {
        try {
            return json.writeValueAsString(o);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static String day(int n) {
        return LocalDate.now(ParentDataService.SCHOOL_ZONE).plusDays(n).toString();
    }

    private void route(String id, String name, String vehicle, int capacity, String[][] stops) {
        List<Map<String, Object>> st = new ArrayList<>();
        for (String[] s : stops) st.add(Map.of("name", s[0], "pickup", s[1], "drop", s[2]));
        routes.save(BusRoute.builder().id(id).name(name).vehicleNo(vehicle).capacity(capacity).stopsJson(w(st)).feePerInstalment(1500L).build());
    }

    private void rider(String studentId, String route, String stop) {
        students.findById(studentId).ifPresent(s -> {
            s.setTransportRouteId(route);
            s.setTransportStop(stop);
            students.save(s);
        });
    }

    public void seedGvs() {
        if (routes.count() > 0) return;
        route("Route 2", "Route 2 · Madhapur", "TS 09 UB 2211", 40, new String[][]{{"Madhapur Metro", "07:10", "16:05"}, {"Hitech City", "07:20", "15:55"}});
        route("Route 4", "Route 4 · Kondapur", "TS 09 UB 4410", 3, new String[][]{{"Kondapur X Roads", "07:05", "16:10"}, {"Botanical Garden", "07:15", "16:00"}});
        route("Route 7", "Route 7 · Gachibowli", "TS 09 UB 7702", 36, new String[][]{{"Gachibowli Stadium", "07:00", "16:15"}, {"DLF Gate", "07:12", "16:02"}});
        rider("GVS-2027-0001", "Route 4", "Kondapur X Roads");
        rider("GVS-2031-0042", "Route 4", "Kondapur X Roads");
        rider("GVS-2027-0006", "Route 4", "Kondapur X Roads");
        rider("GVS-2027-0003", "Route 2", "Madhapur Metro");
        requests.save(TransportRequest.builder().id("TRQ-GVS-1").studentId("GVS-2028-0117").requestedByGuardianId("GRD-0003").kind("NEW").toRouteId("Route 4")
                .stopName("Botanical Garden").reason("We moved to Kondapur this month.").effectiveFrom(day(7)).status("PENDING").createdAt(day(-1) + "T19:00:00+05:30").build());
        List<Map<String, Object>> log = List.of(Map.of("at", day(-2) + "T20:10:00+05:30", "by", "GRD-0001", "byRole", "PARENT", "action", "RAISED"));
        complaints.save(ComplaintCase.builder().id("CMP-GVS-1").studentId("GVS-2027-0001").raisedByGuardianId("GRD-0001").raisedByName("Rajesh Sharma")
                .category("TRANSPORT").subject("Route 4 bus late in the evening").description("The bus reached Kondapur 25 minutes late on three days this week.")
                .status("OPEN").createdAt(day(-2) + "T20:10:00+05:30").principalInformed(false).logJson(w(log)).build());
    }
}
