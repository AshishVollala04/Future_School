package com.futureschool.backend.bus;

import com.fasterxml.jackson.core.type.TypeReference;
import com.futureschool.backend.auth.AuthFlowException;
import com.futureschool.backend.entity.*;
import com.futureschool.backend.governance.GovernanceService;
import com.futureschool.backend.repository.BusRouteRepository;
import com.futureschool.backend.repository.BusTrackerLinkRepository;
import com.futureschool.backend.repository.BusTripRepository;
import com.futureschool.backend.security.SchoolPrincipal;
import com.futureschool.backend.teaching.Teaching;
import com.futureschool.backend.tenant.TenantContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.*;
import java.util.function.Supplier;

/**
 * Live bus tracking from the driver's phone.
 *
 *  - The office (Admin with TRANSPORT) makes a private driver link per route; only its hash is stored.
 *    Making a new link cancels the old one.
 *  - The driver opens the link (no sign-in), starts a PICKUP or DROP trip, and the page sends the
 *    phone's position every few seconds. The driver can also save "this stop is here".
 *  - A trip keeps only the latest position, and clears it when the trip ends. No history is kept.
 *  - Parents see the bus only for their child's route and only while a trip is live.
 */
@Service
public class BusTrackingService {

    static final long STALE_MS = 2 * 60_000L;          // no update for 2 minutes: "signal lost"
    static final long AUTO_END_MS = 3 * 60 * 60_000L;   // a trip nobody ended stops counting after 3 hours
    static final long MIN_PING_GAP_MS = 4_000L;
    private static final TypeReference<List<Map<String, Object>>> LIST = new TypeReference<>() {
    };
    private static final SecureRandom RANDOM = new SecureRandom();

    private final BusTrackerLinkRepository links;
    private final BusTripRepository trips;
    private final BusRouteRepository routes;
    private final Teaching t;
    private final TransactionTemplate tx;

    public BusTrackingService(BusTrackerLinkRepository links, BusTripRepository trips, BusRouteRepository routes, Teaching t,
                              PlatformTransactionManager txm) {
        this.links = links;
        this.trips = trips;
        this.routes = routes;
        this.t = t;
        this.tx = new TransactionTemplate(txm);
    }

    // ================================================================== helpers

    static String hash(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static AuthFlowException gone() {
        return new AuthFlowException("LINK_INVALID", "This driver link is no longer valid. Ask the school office for the new link.", null, 404);
    }

    private static void requireTransportView(SchoolPrincipal p) {
        if (p.role() != UserRole.PRINCIPAL) GovernanceService.requirePermission(p, "TRANSPORT");
    }

    private BusRoute route(String routeId) {
        return routes.findById(routeId == null ? "" : routeId).orElseThrow(() -> Teaching.rule("NOT_FOUND", "Route not found in this school."));
    }

    private List<Map<String, Object>> stops(BusRoute r) {
        return r.getStopsJson() == null || r.getStopsJson().isBlank() ? new ArrayList<>() : new ArrayList<>(t.read(r.getStopsJson(), LIST));
    }

    /** The live trip of a route, or empty. A trip left running for hours is closed here. */
    private Optional<BusTrip> live(String routeId) {
        Optional<BusTrip> trip = trips.findFirstByRouteIdAndStatus(routeId, "LIVE");
        long now = System.currentTimeMillis();
        if (trip.isPresent()) {
            BusTrip b = trip.get();
            long last = b.getLastAt() != null ? b.getLastAt() : b.getStartedAt();
            if (now - last > AUTO_END_MS) {
                close(b, now);
                return Optional.empty();
            }
        }
        return trip;
    }

    private void close(BusTrip b, long now) {
        b.setStatus("ENDED");
        b.setEndedAt(now);
        b.setLastLat(null);
        b.setLastLng(null);
        b.setLastAccuracy(null);
        trips.save(b);
    }

    static double km(double lat1, double lng1, double lat2, double lng2) {
        double r = 6371.0, dLat = Math.toRadians(lat2 - lat1), dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)));
    }

    private static Double num(Object o) {
        return o instanceof Number n ? n.doubleValue() : null;
    }

    private Map<String, Object> tripView(BusTrip b) {
        Map<String, Object> m = new LinkedHashMap<>();
        long now = System.currentTimeMillis();
        m.put("id", b.getId());
        m.put("direction", b.getDirection());
        m.put("startedAt", b.getStartedAt());
        if (b.getLastAt() != null && b.getLastLat() != null) {
            m.put("lat", b.getLastLat());
            m.put("lng", b.getLastLng());
            m.put("accuracyM", b.getLastAccuracy());
            m.put("updatedAt", b.getLastAt());
            m.put("stale", now - b.getLastAt() > STALE_MS);
        } else {
            m.put("stale", now - b.getStartedAt() > STALE_MS);
        }
        return m;
    }

    // ================================================================== office

    @Transactional
    public Map<String, Object> createLink(SchoolPrincipal p, String routeId) {
        GovernanceService.requirePermission(p, "TRANSPORT");
        BusRoute r = route(routeId);
        links.findBySchoolIdAndRouteIdAndRevokedFalse(t.school(), r.getId()).forEach(l -> {
            l.setRevoked(true);
            links.save(l);
        });
        byte[] raw = new byte[24];
        RANDOM.nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        links.save(BusTrackerLink.builder().id("BTL-" + UUID.randomUUID()).schoolId(t.school()).routeId(r.getId()).tokenHash(hash(token))
                .createdBy(p.account().getId()).createdAt(Teaching.now()).revoked(false).build());
        t.record(p, "BUS_DRIVER_LINK_CREATED", r.getId(), "New driver tracking link for " + r.getName() + "; any older link stops working.", null);
        return Map.of("routeId", r.getId(), "token", token);
    }

    @Transactional
    public Map<String, Object> revokeLink(SchoolPrincipal p, String routeId) {
        GovernanceService.requirePermission(p, "TRANSPORT");
        BusRoute r = route(routeId);
        int n = 0;
        for (BusTrackerLink l : links.findBySchoolIdAndRouteIdAndRevokedFalse(t.school(), r.getId())) {
            l.setRevoked(true);
            links.save(l);
            n++;
        }
        if (n > 0) t.record(p, "BUS_DRIVER_LINK_REVOKED", r.getId(), "Driver tracking link for " + r.getName() + " cancelled.", null);
        return Map.of("routeId", r.getId(), "revoked", n);
    }

    @Transactional
    public List<Map<String, Object>> officeLive(SchoolPrincipal p) {
        requireTransportView(p);
        List<Map<String, Object>> out = new ArrayList<>();
        for (BusRoute r : routes.findAll()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("routeId", r.getId());
            m.put("name", r.getName());
            m.put("vehicleNo", r.getVehicleNo());
            m.put("hasDriverLink", !links.findBySchoolIdAndRouteIdAndRevokedFalse(t.school(), r.getId()).isEmpty());
            live(r.getId()).ifPresent(b -> m.put("trip", tripView(b)));
            out.add(m);
        }
        out.sort(Comparator.comparing(m -> m.get("name").toString()));
        return out;
    }

    // ================================================================== parent

    @Transactional
    public Map<String, Object> parentLive(SchoolPrincipal p) {
        if (p.role() != UserRole.PARENT || p.sessionStudentId() == null) throw Teaching.denied("This is a parent view.");
        Student s = t.students().findById(p.sessionStudentId()).orElseThrow(() -> Teaching.denied("Student not found."));
        Map<String, Object> out = new LinkedHashMap<>();
        if (s.getTransportRouteId() == null) {
            out.put("usesTransport", false);
            return out;
        }
        BusRoute r = route(s.getTransportRouteId());
        out.put("usesTransport", true);
        out.put("routeName", r.getName());
        out.put("vehicleNo", r.getVehicleNo());
        Map<String, Object> stop = stops(r).stream().filter(x -> Objects.equals(x.get("name"), s.getTransportStop())).findFirst().orElse(null);
        if (stop != null) out.put("stop", stop);
        live(r.getId()).ifPresent(b -> {
            Map<String, Object> trip = tripView(b);
            Double sLat = stop == null ? null : num(stop.get("lat")), sLng = stop == null ? null : num(stop.get("lng"));
            if (sLat != null && sLng != null && b.getLastLat() != null) {
                trip.put("distanceKm", Math.round(km(b.getLastLat(), b.getLastLng(), sLat, sLng) * 10) / 10.0);
            }
            out.put("trip", trip);
        });
        return out;
    }

    // ================================================================== driver (public, by link)

    /** Finds the link (any school), then runs the body as that school, in one transaction. */
    private <T> T asDriver(String token, java.util.function.Function<BusTrackerLink, T> body) {
        if (token == null || token.length() < 20 || token.length() > 64) throw gone();
        BusTrackerLink link = links.findByTokenHashAndRevokedFalse(hash(token)).orElseThrow(BusTrackingService::gone);
        Supplier<T> run = () -> tx.execute(status -> body.apply(link));
        return TenantContext.callAs(link.getSchoolId(), run);
    }

    private Map<String, Object> driverView(BusTrackerLink link) {
        BusRoute r = route(link.getRouteId());
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("routeName", r.getName());
        m.put("vehicleNo", r.getVehicleNo());
        m.put("stops", stops(r));
        live(r.getId()).ifPresent(b -> m.put("trip", tripView(b)));
        return m;
    }

    public Map<String, Object> driver(String token) {
        return asDriver(token, this::driverView);
    }

    public Map<String, Object> start(String token, String direction) {
        String dir = "DROP".equals(direction) ? "DROP" : "PICKUP";
        return asDriver(token, link -> {
            if (live(link.getRouteId()).isEmpty()) {
                trips.save(BusTrip.builder().id("TRIP-" + UUID.randomUUID()).routeId(link.getRouteId()).direction(dir).status("LIVE")
                        .startedAt(System.currentTimeMillis()).build());
            }
            return driverView(link);
        });
    }

    public Map<String, Object> ping(String token, Double lat, Double lng, Double accuracy) {
        if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180 || (lat == 0 && lng == 0)) {
            throw Teaching.rule("BAD_POSITION", "The phone sent an invalid position.");
        }
        return asDriver(token, link -> {
            BusTrip b = live(link.getRouteId()).orElseThrow(() -> Teaching.rule("NO_TRIP", "Start a trip first."));
            long now = System.currentTimeMillis();
            if (b.getLastAt() == null || now - b.getLastAt() >= MIN_PING_GAP_MS) {
                b.setLastLat(lat);
                b.setLastLng(lng);
                b.setLastAccuracy(accuracy == null ? null : Math.min(accuracy, 100_000));
                b.setLastAt(now);
                trips.save(b);
            }
            return tripView(b);
        });
    }

    public Map<String, Object> end(String token) {
        return asDriver(token, link -> {
            live(link.getRouteId()).ifPresent(b -> close(b, System.currentTimeMillis()));
            return driverView(link);
        });
    }

    /** The driver stands at a stop and saves its position, so parents see the distance to their stop. */
    public Map<String, Object> markStop(String token, int index, Double lat, Double lng) {
        if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            throw Teaching.rule("BAD_POSITION", "The phone sent an invalid position.");
        }
        return asDriver(token, link -> {
            BusRoute r = route(link.getRouteId());
            List<Map<String, Object>> st = stops(r);
            if (index < 0 || index >= st.size()) throw Teaching.rule("NOT_FOUND", "Stop not found on this route.");
            Map<String, Object> s = new LinkedHashMap<>(st.get(index));
            s.put("lat", Math.round(lat * 1e6) / 1e6);
            s.put("lng", Math.round(lng * 1e6) / 1e6);
            st.set(index, s);
            r.setStopsJson(t.write(st));
            routes.save(r);
            return driverView(link);
        });
    }
}
