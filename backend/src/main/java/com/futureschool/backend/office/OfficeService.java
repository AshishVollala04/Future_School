package com.futureschool.backend.office;

import com.fasterxml.jackson.core.type.TypeReference;
import com.futureschool.backend.auth.AuthFlowException;
import com.futureschool.backend.auth.SignInService;
import com.futureschool.backend.entity.*;
import com.futureschool.backend.governance.GovernanceService;
import com.futureschool.backend.parent.ParentDataService;
import com.futureschool.backend.repository.*;
import com.futureschool.backend.security.SchoolPrincipal;
import com.futureschool.backend.teaching.Teaching;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.*;

/**
 * Complaints (Flow 5), transport (Flow 4) and early-pickup passes.
 *
 * Complaints: parent raises for the session child -> Admin (COMPLAINTS) replies / works / resolves
 *   -> parent confirms (CLOSED) or reopens with a reason. SAFETY is flagged to the Principal. Never deleted.
 * Transport: parent requests start/change/stop -> Admin (TRANSPORT) approves (seats re-checked) or rejects.
 *   Fee changes are a Finance (governance) matter; approving a route never changes fees.
 * Pickup: parent issues a pass for a named person after a fresh PICKUP_AUTHORIZATION OTP. The server
 *   generates the code, stores only its hash, valid 2 hours, used ONCE when staff verify it at the gate.
 */
@Service
public class OfficeService {

    private static final Set<String> CATEGORIES = Set.of("ACADEMIC", "TRANSPORT", "FACILITY", "SAFETY", "FEES", "OTHER");
    private static final Map<String, Integer> COMPLAINT_RANK = Map.of("REOPENED", 0, "OPEN", 1, "IN_PROGRESS", 2, "RESOLVED", 3, "CLOSED", 4);
    private static final TypeReference<List<Map<String, Object>>> LIST = new TypeReference<>() {
    };
    private static final Duration PASS_TTL = Duration.ofHours(2);

    private final Teaching t;
    private final ComplaintCaseRepository complaints;
    private final BusRouteRepository routes;
    private final TransportRequestRepository requests;
    private final PickupPassRepository passes;
    private final UserAccountRepository accounts;
    private final SchoolMembershipRepository memberships;
    private final SignInService signIn;
    private final SecureRandom random = new SecureRandom();

    public OfficeService(Teaching t, ComplaintCaseRepository complaints, BusRouteRepository routes, TransportRequestRepository requests,
                         PickupPassRepository passes, UserAccountRepository accounts, SchoolMembershipRepository memberships, SignInService signIn) {
        this.t = t;
        this.complaints = complaints;
        this.routes = routes;
        this.requests = requests;
        this.passes = passes;
        this.accounts = accounts;
        this.memberships = memberships;
        this.signIn = signIn;
    }

    private Student child(SchoolPrincipal p) {
        if (p.role() != UserRole.PARENT || p.sessionStudentId() == null) throw Teaching.denied("This is a parent action.");
        return t.students().findById(p.sessionStudentId()).orElseThrow(() -> Teaching.denied("Student not found."));
    }

    private static String trimTo(String s, int max) {
        String v = s == null ? "" : s.trim();
        return v.length() > max ? v.substring(0, max) : v;
    }

    private Map<String, Object> logEntry(SchoolPrincipal p, String action, String note) {
        Map<String, Object> e = new LinkedHashMap<>();
        e.put("at", Teaching.now());
        e.put("by", p.account().getId());
        e.put("byRole", p.role().name());
        e.put("action", action);
        if (note != null && !note.isBlank()) e.put("note", note);
        return e;
    }

    // ================================================================== complaints

    private Map<String, Object> complaintView(ComplaintCase c, boolean withStudent) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", c.getId());
        m.put("schoolId", c.getSchoolId());
        m.put("studentId", c.getStudentId());
        m.put("raisedByGuardianId", c.getRaisedByGuardianId());
        m.put("raisedByName", c.getRaisedByName());
        m.put("category", c.getCategory());
        m.put("subject", c.getSubject());
        m.put("description", c.getDescription());
        m.put("status", c.getStatus());
        m.put("createdAt", c.getCreatedAt());
        m.put("principalInformed", Boolean.TRUE.equals(c.getPrincipalInformed()));
        m.put("log", t.read(c.getLogJson(), LIST));
        if (withStudent) t.students().findById(c.getStudentId()).ifPresent(s -> {
            m.put("studentName", s.getName());
            m.put("classLabel", ParentDataService.gradeOf(s) + "-" + s.getSection());
        });
        return m;
    }

    private void addLog(ComplaintCase c, Map<String, Object> e) {
        List<Map<String, Object>> l = new ArrayList<>(t.read(c.getLogJson(), LIST));
        l.add(e);
        c.setLogJson(t.write(l));
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> myComplaints(SchoolPrincipal p) {
        Student s = child(p);
        return complaints.findAll().stream().filter(c -> c.getStudentId().equals(s.getId()))
                .sorted(Comparator.comparing(ComplaintCase::getCreatedAt).reversed()).map(c -> complaintView(c, false)).toList();
    }

    @Transactional
    public Map<String, Object> raiseComplaint(SchoolPrincipal p, String category, String subject, String description) {
        Student s = child(p);
        if (category == null || !CATEGORIES.contains(category)) throw Teaching.rule("CATEGORY", "Choose what the complaint is about.");
        String subj = trimTo(subject, 120), desc = trimTo(description, 1000);
        if (subj.length() < 5) throw Teaching.rule("SUBJECT", "Add a short subject.");
        if (desc.length() < 15) throw Teaching.rule("DESCRIPTION", "Describe the issue (15+ characters).");
        long open = complaints.findAll().stream().filter(c -> c.getStudentId().equals(s.getId()) && List.of("OPEN", "IN_PROGRESS", "REOPENED").contains(c.getStatus())).count();
        if (open >= 5) throw Teaching.rule("LIMIT", "You have 5 open complaints. Please wait for the school to respond.");
        ComplaintCase c = ComplaintCase.builder().id("CMP-" + t.school() + "-" + UUID.randomUUID().toString().substring(0, 8)).studentId(s.getId())
                .raisedByGuardianId(p.account().getId()).raisedByName(p.account().getName()).category(category).subject(subj).description(desc)
                .status("OPEN").createdAt(Teaching.now()).principalInformed("SAFETY".equals(category)).logJson("[]").build();
        addLog(c, logEntry(p, "RAISED", null));
        complaints.save(c);
        t.record(p, "COMPLAINT_RAISED", c.getId(), category + ": " + subj, null);
        return complaintView(c, false);
    }

    private ComplaintCase mine(SchoolPrincipal p, String id) {
        Student s = child(p);
        return complaints.findById(id == null ? "" : id).filter(c -> c.getStudentId().equals(s.getId())).orElseThrow(() -> Teaching.denied("Complaint not found."));
    }

    @Transactional
    public Map<String, Object> confirmResolved(SchoolPrincipal p, String id) {
        ComplaintCase c = mine(p, id);
        if (!"RESOLVED".equals(c.getStatus())) throw Teaching.rule("STATE", "Only a resolved complaint can be confirmed.");
        c.setStatus("CLOSED");
        addLog(c, logEntry(p, "CONFIRMED", null));
        return complaintView(complaints.save(c), false);
    }

    @Transactional
    public Map<String, Object> reopen(SchoolPrincipal p, String id, String reason) {
        ComplaintCase c = mine(p, id);
        if (!"RESOLVED".equals(c.getStatus())) throw Teaching.rule("STATE", "Only a resolved complaint can be reopened.");
        String r = trimTo(reason, 500);
        if (r.length() < 10) throw Teaching.rule("REASON", "Tell the school what is still not right.");
        c.setStatus("REOPENED");
        addLog(c, logEntry(p, "REOPENED", r));
        return complaintView(complaints.save(c), false);
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> schoolComplaints(SchoolPrincipal p) {
        if (p.role() != UserRole.PRINCIPAL) GovernanceService.requirePermission(p, "COMPLAINTS");
        return complaints.findAll().stream()
                // The Principal sees safety complaints (always flagged to them); Admins with COMPLAINTS see all.
                .filter(c -> p.role() != UserRole.PRINCIPAL || Boolean.TRUE.equals(c.getPrincipalInformed()))
                .sorted(Comparator.comparingInt((ComplaintCase c) -> COMPLAINT_RANK.getOrDefault(c.getStatus(), 9)).thenComparing(ComplaintCase::getCreatedAt))
                .map(c -> complaintView(c, true)).toList();
    }

    @Transactional
    public Map<String, Object> respond(SchoolPrincipal p, String id, String note, String status) {
        GovernanceService.requirePermission(p, "COMPLAINTS");
        ComplaintCase c = complaints.findById(id == null ? "" : id).orElseThrow(() -> Teaching.denied("Complaint not found."));
        if ("CLOSED".equals(c.getStatus())) throw Teaching.rule("STATE", "The parent has closed this complaint.");
        if (!"IN_PROGRESS".equals(status) && !"RESOLVED".equals(status)) throw Teaching.rule("STATUS", "Keep working or mark resolved.");
        String n = trimTo(note, 1000);
        if (n.length() < 10) throw Teaching.rule("NOTE", "Write a reply the parent will see (10+ characters).");
        c.setStatus(status);
        addLog(c, logEntry(p, "RESOLVED".equals(status) ? "RESOLVED" : "RESPONDED", n));
        complaints.save(c);
        t.record(p, "COMPLAINT_" + status, c.getId(), c.getSubject(), null);
        return complaintView(c, true);
    }

    // ================================================================== transport

    private Map<String, Object> routeView(BusRoute r) {
        long riders = t.students().findAll().stream().filter(s -> "Active".equals(s.getStatus()) && r.getId().equals(s.getTransportRouteId())).count();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", r.getId());
        m.put("schoolId", r.getSchoolId());
        m.put("name", r.getName());
        m.put("vehicleNo", r.getVehicleNo());
        m.put("capacity", r.getCapacity());
        m.put("stops", t.read(r.getStopsJson(), LIST));
        m.put("feePerInstalment", r.getFeePerInstalment());
        m.put("riders", riders);
        m.put("seatsLeft", Math.max(0, r.getCapacity() - riders));
        return m;
    }

    private Map<String, Object> requestView(TransportRequest r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", r.getId());
        m.put("schoolId", r.getSchoolId());
        m.put("studentId", r.getStudentId());
        m.put("requestedByGuardianId", r.getRequestedByGuardianId());
        m.put("kind", r.getKind());
        if (r.getFromRouteId() != null) m.put("fromRouteId", r.getFromRouteId());
        if (r.getToRouteId() != null) m.put("toRouteId", r.getToRouteId());
        if (r.getStopName() != null) m.put("stopName", r.getStopName());
        m.put("reason", r.getReason());
        m.put("effectiveFrom", r.getEffectiveFrom());
        m.put("status", r.getStatus());
        m.put("createdAt", r.getCreatedAt());
        if (r.getDecidedBy() != null) {
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("by", r.getDecidedBy());
            d.put("at", r.getDecidedAt());
            if (r.getDecisionNote() != null) d.put("note", r.getDecisionNote());
            m.put("decision", d);
        }
        return m;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> myTransport(SchoolPrincipal p) {
        Student s = child(p);
        List<Map<String, Object>> rs = routes.findAll().stream().map(this::routeView).toList();
        Map<String, Object> out = new LinkedHashMap<>();
        rs.stream().filter(r -> r.get("id").equals(s.getTransportRouteId())).findFirst().ifPresent(r -> {
            Map<String, Object> cur = new LinkedHashMap<>();
            cur.put("route", r);
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> stops = (List<Map<String, Object>>) r.get("stops");
            stops.stream().filter(x -> x.get("name").equals(s.getTransportStop())).findFirst().ifPresent(x -> cur.put("stop", x));
            out.put("current", cur);
        });
        out.put("routes", rs);
        out.put("requests", requests.findAll().stream().filter(r -> r.getStudentId().equals(s.getId()))
                .sorted(Comparator.comparing(TransportRequest::getCreatedAt).reversed()).map(this::requestView).toList());
        return out;
    }

    @Transactional
    public Map<String, Object> requestTransport(SchoolPrincipal p, String kind, String toRouteId, String stopName, String reason, String effectiveFrom) {
        Student s = child(p);
        if (requests.findAll().stream().anyMatch(r -> r.getStudentId().equals(s.getId()) && "PENDING".equals(r.getStatus()))) {
            throw Teaching.rule("PENDING_EXISTS", "A request is already waiting. Withdraw it first to change it.");
        }
        boolean stop = "STOP".equals(kind);
        if (stop && s.getTransportRouteId() == null) throw Teaching.rule("NO_ROUTE", "Your child does not use school transport.");
        if (!stop) {
            BusRoute r = routes.findById(toRouteId == null ? "" : toRouteId).orElseThrow(() -> Teaching.rule("ROUTE", "Choose a route."));
            boolean stopOk = t.read(r.getStopsJson(), LIST).stream().anyMatch(x -> x.get("name").equals(stopName));
            if (!stopOk) throw Teaching.rule("STOP", "Choose a stop on that route.");
            if (r.getId().equals(s.getTransportRouteId()) && Objects.equals(stopName, s.getTransportStop())) throw Teaching.rule("SAME", "That is already your route and stop.");
        }
        if (effectiveFrom == null || effectiveFrom.compareTo(ParentDataService.today()) < 0) throw Teaching.rule("DATE", "The start date cannot be in the past.");
        String rs = trimTo(reason, 300);
        if (rs.length() < 5) throw Teaching.rule("REASON", "Add a short reason.");
        TransportRequest r = TransportRequest.builder().id("TRQ-" + t.school() + "-" + UUID.randomUUID().toString().substring(0, 8)).studentId(s.getId())
                .requestedByGuardianId(p.account().getId()).kind(s.getTransportRouteId() == null ? "NEW" : stop ? "STOP" : "CHANGE")
                .fromRouteId(s.getTransportRouteId()).toRouteId(stop ? null : toRouteId).stopName(stop ? null : stopName).reason(rs)
                .effectiveFrom(effectiveFrom).status("PENDING").createdAt(Teaching.now()).build();
        return requestView(requests.save(r));
    }

    @Transactional
    public Map<String, Object> withdrawTransport(SchoolPrincipal p, String id) {
        Student s = child(p);
        TransportRequest r = requests.findById(id == null ? "" : id).filter(x -> x.getStudentId().equals(s.getId()))
                .orElseThrow(() -> Teaching.denied("Request not found."));
        if (!"PENDING".equals(r.getStatus())) throw Teaching.rule("STATE", "Only a waiting request can be withdrawn.");
        r.setStatus("WITHDRAWN");
        return requestView(requests.save(r));
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> listRoutes(SchoolPrincipal p) {
        GovernanceService.requirePermission(p, "TRANSPORT");
        return routes.findAll().stream().map(r -> {
            Map<String, Object> m = routeView(r);
            m.put("riderList", t.students().findAll().stream().filter(s -> "Active".equals(s.getStatus()) && r.getId().equals(s.getTransportRouteId()))
                    .map(s -> {
                        Map<String, Object> x = new LinkedHashMap<>();
                        x.put("id", s.getId());
                        x.put("name", s.getName());
                        x.put("classLabel", ParentDataService.gradeOf(s) + "-" + s.getSection());
                        if (s.getTransportStop() != null) x.put("stop", s.getTransportStop());
                        return x;
                    }).toList());
            return m;
        }).toList();
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> listTransportRequests(SchoolPrincipal p) {
        GovernanceService.requirePermission(p, "TRANSPORT");
        return requests.findAll().stream()
                .sorted(Comparator.comparing((TransportRequest r) -> !"PENDING".equals(r.getStatus())).thenComparing(TransportRequest::getCreatedAt, Comparator.reverseOrder()))
                .map(r -> {
                    Map<String, Object> m = requestView(r);
                    t.students().findById(r.getStudentId()).ifPresent(s -> {
                        m.put("studentName", s.getName());
                        m.put("classLabel", ParentDataService.gradeOf(s) + "-" + s.getSection());
                    });
                    if (r.getToRouteId() != null) routes.findById(r.getToRouteId()).ifPresent(x -> m.put("toRouteSeatsLeft", routeView(x).get("seatsLeft")));
                    return m;
                }).toList();
    }

    @Transactional
    public Map<String, Object> decideTransport(SchoolPrincipal p, String id, String decision, String note) {
        GovernanceService.requirePermission(p, "TRANSPORT");
        TransportRequest r = requests.findById(id == null ? "" : id).orElseThrow(() -> Teaching.denied("Request not found."));
        if (!"PENDING".equals(r.getStatus())) throw Teaching.rule("STATE", "Already decided.");
        if (!"APPROVED".equals(decision) && !"REJECTED".equals(decision)) throw Teaching.rule("BAD_DECISION", "Approve or reject.");
        String n = trimTo(note, 300);
        if ("REJECTED".equals(decision) && n.length() < 5) throw Teaching.rule("REASON", "Tell the parent why (5+ characters).");
        Student s = t.students().findById(r.getStudentId()).orElseThrow(() -> Teaching.denied("Student not found."));
        if ("APPROVED".equals(decision)) {
            if ("STOP".equals(r.getKind())) {
                s.setTransportRouteId(null);
                s.setTransportStop(null);
            } else {
                BusRoute route = routes.findById(r.getToRouteId()).orElseThrow(() -> Teaching.rule("ROUTE", "Route no longer exists."));
                boolean moving = !route.getId().equals(s.getTransportRouteId());
                if (moving && ((Number) routeView(route).get("seatsLeft")).longValue() <= 0) {
                    throw Teaching.rule("FULL", route.getName() + " is full (" + route.getCapacity() + " seats). Reject, or offer another route.");
                }
                s.setTransportRouteId(route.getId());
                s.setTransportStop(r.getStopName());
            }
            t.students().save(s);
        }
        r.setStatus(decision);
        r.setDecidedBy(p.account().getId());
        r.setDecidedAt(Teaching.now());
        r.setDecisionNote(n.isEmpty() ? null : n);
        requests.save(r);
        t.record(p, "TRANSPORT_" + decision, s.getId(), r.getKind() + " " + (r.getFromRouteId() == null ? "-" : r.getFromRouteId()) + " -> "
                + (r.getToRouteId() == null ? "none" : r.getToRouteId()) + " from " + r.getEffectiveFrom(), n.isEmpty() ? null : n);
        return requestView(r);
    }

    // ================================================================== pickup

    private static String hash(String code) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(code.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private Map<String, Object> passView(PickupPass x, String code) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", x.getId());
        m.put("studentId", x.getStudentId());
        m.put("personName", x.getPersonName());
        m.put("relation", x.getRelation());
        m.put("mobileMasked", x.getMobile().length() >= 4 ? "••••••" + x.getMobile().substring(x.getMobile().length() - 4) : "••••");
        m.put("reason", x.getReason());
        m.put("issuedAt", x.getIssuedAt());
        m.put("validUntil", x.getValidUntil().toEpochMilli());
        String status = "ACTIVE".equals(x.getStatus()) && Instant.now().isAfter(x.getValidUntil()) ? "EXPIRED" : x.getStatus();
        m.put("status", status);
        if (x.getUsedAt() != null) m.put("usedAt", x.getUsedAt());
        if (code != null) m.put("code", code); // shown ONCE, at issue time
        return m;
    }

    /** People already allowed to collect the child: the guardians linked to them in this school. */
    @Transactional(readOnly = true)
    public Map<String, Object> myPickup(SchoolPrincipal p) {
        Student s = child(p);
        List<Map<String, Object>> guardians = memberships.findBySchoolIdAndRole(t.school(), UserRole.PARENT).stream()
                .filter(SchoolMembership::isActive)
                .map(m -> accounts.findById(m.getAccountId()).orElse(null))
                .filter(a -> a != null && a.getLinkedStudentIds() != null && a.getLinkedStudentIds().contains(s.getId()))
                .map(a -> Map.<String, Object>of("name", a.getName(), "mobileMasked", a.getMobile() == null ? "" : "••••••" + a.getMobile().substring(Math.max(0, a.getMobile().length() - 4)),
                        "you", a.getId().equals(p.account().getId())))
                .toList();
        List<Map<String, Object>> list = passes.findAll().stream().filter(x -> x.getStudentId().equals(s.getId()))
                .sorted(Comparator.comparing(PickupPass::getIssuedAt).reversed()).map(x -> passView(x, null)).toList();
        return Map.of("guardians", guardians, "passes", list);
    }

    @Transactional(noRollbackFor = AuthFlowException.class)
    public Map<String, Object> issuePass(SchoolPrincipal p, String personName, String relation, String mobile, String reason, String stepUpToken) {
        Student s = child(p);
        String name = trimTo(personName, 128), rel = trimTo(relation, 64), why = trimTo(reason, 300);
        String mob = SignInService.cleanMobile(mobile);
        if (name.length() < 3) throw Teaching.rule("NAME", "Enter the full name of the person collecting the child.");
        if (rel.length() < 3) throw Teaching.rule("RELATION", "Enter their relation to the child.");
        if (mob == null) throw Teaching.rule("MOBILE", "Enter a valid 10-digit mobile number.");
        if (why.length() < 5) throw Teaching.rule("REASON", "Add a short reason.");
        long active = passes.findAll().stream().filter(x -> x.getStudentId().equals(s.getId()) && "ACTIVE".equals(x.getStatus()) && Instant.now().isBefore(x.getValidUntil())).count();
        if (active >= 2) throw Teaching.rule("LIMIT", "There are already 2 active passes for this child. Cancel one first.");
        if (!signIn.consumeStepUp(stepUpToken, "PICKUP_AUTHORIZATION", p.session())) {
            throw new AuthFlowException("STEP_UP_REQUIRED", "Please confirm with the OTP again.", null, 401);
        }
        String alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        StringBuilder code = new StringBuilder();
        for (int i = 0; i < 8; i++) code.append(alphabet.charAt(random.nextInt(alphabet.length())));
        PickupPass x = passes.save(PickupPass.builder().id("PP-" + t.school() + "-" + UUID.randomUUID().toString().substring(0, 8)).studentId(s.getId())
                .issuedByGuardianId(p.account().getId()).personName(name).relation(rel).mobile(mob).reason(why).codeHash(hash(code.toString()))
                .issuedAt(Teaching.now()).validUntil(Instant.now().plus(PASS_TTL)).status("ACTIVE").build());
        t.record(p, "PICKUP_PASS_ISSUED", s.getId(), "Pass for " + name + " (" + rel + "), valid 2 hours.", why);
        return passView(x, code.toString());
    }

    @Transactional
    public Map<String, Object> cancelPass(SchoolPrincipal p, String id) {
        Student s = child(p);
        PickupPass x = passes.findById(id == null ? "" : id).filter(y -> y.getStudentId().equals(s.getId())).orElseThrow(() -> Teaching.denied("Pass not found."));
        if (!"ACTIVE".equals(x.getStatus())) throw Teaching.rule("STATE", "This pass is no longer active.");
        x.setStatus("CANCELLED");
        return passView(passes.save(x), null);
    }

    /** Gate check by staff: valid once, within 2 hours, for this school only. */
    @Transactional
    public Map<String, Object> verifyPass(SchoolPrincipal p, String code) {
        if (!p.isStaff()) throw Teaching.denied("Only school staff check pickup passes.");
        String c = code == null ? "" : code.trim().toUpperCase();
        PickupPass x = passes.findAll().stream().filter(y -> y.getCodeHash().equals(hash(c))).findFirst()
                .orElseThrow(() -> Teaching.rule("INVALID", "No pass with this code."));
        if ("USED".equals(x.getStatus())) throw Teaching.rule("USED", "This pass was already used at " + x.getUsedAt() + ".");
        if (!"ACTIVE".equals(x.getStatus())) throw Teaching.rule("CANCELLED", "This pass was cancelled by the parent.");
        if (Instant.now().isAfter(x.getValidUntil())) throw Teaching.rule("EXPIRED", "This pass has expired.");
        x.setStatus("USED");
        x.setUsedAt(Teaching.now());
        x.setUsedBy(p.account().getId());
        passes.save(x);
        Student s = t.students().findById(x.getStudentId()).orElse(null);
        t.record(p, "PICKUP_PASS_USED", x.getStudentId(), "Collected by " + x.getPersonName() + " (" + x.getRelation() + ").", null);
        Map<String, Object> m = passView(x, null);
        if (s != null) {
            m.put("studentName", s.getName());
            m.put("classLabel", ParentDataService.gradeOf(s) + "-" + s.getSection());
        }
        m.put("mobile", x.getMobile()); // the gate needs the full number to call and confirm
        return m;
    }
}
