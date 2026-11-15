package com.futureschool.backend.governance;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.futureschool.backend.auth.AuthFlowException;
import com.futureschool.backend.auth.SignInService;
import com.futureschool.backend.entity.*;
import com.futureschool.backend.parent.ParentDataService;
import com.futureschool.backend.parent.ParentViews.FeeLine;
import com.futureschool.backend.repository.*;
import com.futureschool.backend.security.SchoolPrincipal;
import com.futureschool.backend.teaching.Teaching;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.*;

/**
 * Policy-sensitive changes.
 *   Admin prepares DRAFT -> server validates -> Principal approves (fresh OTP; approvedHash recorded)
 *   -> server validates AGAIN at execution -> Admin executes -> EXECUTED + audit.
 * If the payload changes after approval, its hash no longer matches approvedHash and execution is
 * BLOCKED until approved again. The Admin cannot approve; the Principal cannot execute.
 * Executing never deletes history: concessions and refunds are new records.
 * Admins need the matching permission (FINANCE for fee changes, ACADEMIC_OPS for exams).
 */
@Service
public class GovernanceService {

    private static final Map<String, String> PERMISSION_FOR_KIND = Map.of(
            "FEE_CONCESSION", "FINANCE", "REFUND", "FINANCE", "LATE_FEE_WAIVER", "FINANCE", "FEE_STRUCTURE", "FINANCE",
            "EXAM_SCHEDULE", "ACADEMIC_OPS", "CLEARANCE_RULE", "ACADEMIC_OPS");
    private static final Map<String, Integer> PRINCIPAL_ORDER = Map.of("PENDING_APPROVAL", 0, "EXECUTION_BLOCKED", 1, "APPROVED", 2, "RETURNED", 3, "EXECUTED", 4, "REJECTED", 5);
    private static final Map<String, String> CATEGORY_NAME = Map.of("SCHOOL_FEE", "school fee", "EXAM_FEE", "exam fee", "TRANSPORT_FEE", "transport fee",
            "ACTIVITY_FEE", "activity fee", "EVENT_FEE", "event fee", "OTHER", "other");
    private static final TypeReference<Map<String, Object>> MAP = new TypeReference<>() {
    };
    private static final TypeReference<List<Map<String, Object>>> LIST = new TypeReference<>() {
    };
    /** Canonical JSON (sorted keys) so the fingerprint does not depend on field order. */
    private static final ObjectMapper CANONICAL = JsonMapper.builder().enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS).build();

    private final ChangeRequestRepository requests;
    private final Teaching t;
    private final ParentDataService fees;
    private final StudentRepository students;
    private final FeeChargeRepository charges;
    private final FeeConcessionRepository concessions;
    private final FeePaymentRepository payments;
    private final FeeRefundRepository refunds;
    private final ExamWindowRepository exams;
    private final SignInService signIn;

    public GovernanceService(ChangeRequestRepository requests, Teaching t, ParentDataService fees, StudentRepository students, FeeChargeRepository charges,
                             FeeConcessionRepository concessions, FeePaymentRepository payments, FeeRefundRepository refunds, ExamWindowRepository exams,
                             SignInService signIn) {
        this.requests = requests;
        this.t = t;
        this.fees = fees;
        this.students = students;
        this.charges = charges;
        this.concessions = concessions;
        this.payments = payments;
        this.refunds = refunds;
        this.exams = exams;
        this.signIn = signIn;
    }

    // ================================================================== helpers

    public static List<String> permissions(SchoolPrincipal p) {
        String csv = p.role() == UserRole.ADMIN ? p.membership().getPermissions() : null;
        return csv == null || csv.isBlank() ? List.of() : Arrays.stream(csv.split(",")).map(String::trim).toList();
    }

    public static void requirePermission(SchoolPrincipal p, String perm) {
        if (p == null || p.role() != UserRole.ADMIN) throw Teaching.denied("This is an Admin action.");
        if (!permissions(p).contains(perm)) throw Teaching.denied("You do not have the " + perm.replace('_', ' ').toLowerCase() + " permission.");
    }

    public static void requireAnyPermission(SchoolPrincipal p, String... perms) {
        if (p == null || p.role() != UserRole.ADMIN) throw Teaching.denied("This is an Admin action.");
        List<String> held = permissions(p);
        for (String perm : perms) {
            if (held.contains(perm)) return;
        }
        throw Teaching.denied("You do not have the required permission.");
    }

    public static String hash(Map<String, Object> payload) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(CANONICAL.writeValueAsString(payload).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(d);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static String str(Map<String, Object> p, String k) {
        Object v = p.get(k);
        return v == null ? "" : v.toString();
    }

    private static long num(Map<String, Object> p, String k) {
        Object v = p.get(k);
        if (v instanceof Number n) return n.longValue();
        try {
            return v == null ? 0 : Long.parseLong(v.toString());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    @SuppressWarnings("unchecked")
    private static List<String> strList(Map<String, Object> p, String k) {
        Object v = p.get(k);
        return v instanceof List<?> l ? l.stream().map(Object::toString).toList() : List.of();
    }

    private ChangeRequest find(String id) {
        return requests.findById(id == null ? "" : id).orElseThrow(() -> Teaching.denied("Request not found."));
    }

    private void history(ChangeRequest r, SchoolPrincipal p, String action, String note) {
        List<Map<String, Object>> h = t.read(r.getHistoryJson(), LIST);
        Map<String, Object> e = new LinkedHashMap<>();
        e.put("at", Teaching.now());
        e.put("by", p.account().getId());
        e.put("action", action);
        if (note != null && !note.isBlank()) e.put("note", note);
        h.add(e);
        r.setHistoryJson(t.write(h));
    }

    // ================================================================== validation (submit, approve, execute)

    public List<String> validate(Map<String, Object> p) {
        List<String> issues = new ArrayList<>();
        String today = ParentDataService.today();
        switch (str(p, "kind")) {
            case "FEE_CONCESSION" -> {
                String sid = str(p, "studentId");
                if (students.findById(sid).isEmpty()) issues.add("Student not found.");
                long amt = num(p, "amountPerCharge");
                if (amt <= 0) issues.add("Concession amount must be positive.");
                if (str(p, "justification").trim().length() < 15) issues.add("Add a proper justification (15+ characters).");
                List<FeeLine> lines = fees.feeLines(sid, today);
                for (String cid : strList(p, "chargeIds")) {
                    FeeLine l = lines.stream().filter(x -> x.charge().id().equals(cid)).findFirst().orElse(null);
                    if (l == null) issues.add("Charge " + cid + " not found for this student.");
                    else if (amt > l.outstanding()) issues.add(l.charge().label() + " (instalment " + l.charge().instalment() + "): concession "
                            + ParentDataService.inr(amt) + " is more than the outstanding " + ParentDataService.inr(l.outstanding()) + ".");
                }
                if (strList(p, "chargeIds").isEmpty()) issues.add("Choose at least one charge.");
            }
            case "REFUND" -> {
                FeePayment pay = payments.findById(str(p, "paymentId")).orElse(null);
                if (pay == null) {
                    issues.add("Original payment not found.");
                    break;
                }
                long refunded = refunds.findByPaymentIdIn(List.of(pay.getId())).stream().filter(r -> !"REJECTED".equals(r.getStatus())).mapToLong(FeeRefund::getAmount).sum();
                long amt = num(p, "amount");
                if (amt <= 0) issues.add("Refund amount must be positive.");
                if (amt + refunded > pay.getAmount()) issues.add("Refund exceeds what is refundable on " + pay.getReceiptNo() + " (" + ParentDataService.inr(pay.getAmount() - refunded) + " left).");
                if (str(p, "reason").trim().length() < 10) issues.add("Give the refund reason.");
            }
            case "LATE_FEE_WAIVER" -> {
                if (num(p, "amount") <= 0) issues.add("Waiver amount must be positive.");
            }
            case "EXAM_SCHEDULE" -> {
                if (exams.findById(str(p, "examId")).isEmpty()) issues.add("Exam not found.");
                String d = str(p, "newStartsOn");
                if (d.compareTo(today) <= 0) issues.add("New start date must be in the future.");
                try {
                    if (LocalDate.parse(d).getDayOfWeek() == DayOfWeek.SUNDAY) issues.add("New start date is a Sunday.");
                } catch (Exception e) {
                    issues.add("Choose a valid date.");
                }
            }
            case "FEE_STRUCTURE" -> {
                if (num(p, "newSchoolFee") <= 0) issues.add("Fee must be positive.");
                List<FeeCharge> affected = feeStructureCharges(p);
                Set<String> ids = new HashSet<>(affected.stream().map(FeeCharge::getId).toList());
                long paid = affected.stream().filter(c -> payments.findByStudentIdOrderByPaidAtDesc(c.getStudentId()).stream()
                        .anyMatch(pay -> pay.getAllocations().stream().anyMatch(a -> ids.contains(a.getChargeId()) && a.getChargeId().equals(c.getId())))).count();
                if (paid > 0) issues.add(paid + " student(s) already paid this instalment; change it with adjustments instead.");
            }
            case "CLEARANCE_RULE" -> {
                ExamWindow ex = exams.findById(str(p, "examId")).orElse(null);
                if (ex == null) issues.add("Exam not found.");
                else if (ex.getStartsOn().compareTo(today) <= 0) issues.add("The exam has already started; its clearance rule is locked.");
                if (strList(p, "categories").isEmpty()) issues.add("Choose at least one fee category.");
                if (str(p, "reason").trim().length() < 10) issues.add("Give the reason for the change.");
            }
            default -> issues.add("Unknown change type.");
        }
        return issues;
    }

    private List<FeeCharge> feeStructureCharges(Map<String, Object> p) {
        long grade = num(p, "grade");
        long ins = num(p, "instalment");
        return charges.findAll().stream()
                .filter(c -> "SCHOOL_FEE".equals(c.getCategory()) && c.getInstalment() == ins)
                .filter(c -> students.findById(c.getStudentId()).map(s -> ParentDataService.gradeOf(s) == grade).orElse(false))
                .toList();
    }

    private void apply(ChangeRequest r, Map<String, Object> p, SchoolPrincipal actor) {
        switch (str(p, "kind")) {
            case "FEE_CONCESSION" -> {
                int i = 0;
                for (String cid : strList(p, "chargeIds")) {
                    concessions.save(FeeConcession.builder().id("CON-" + r.getId() + "-" + (++i)).chargeId(cid).kind(str(p, "concessionKind"))
                            .amount(num(p, "amountPerCharge")).approvedOn(ParentDataService.today()).build());
                }
            }
            // The original payment is untouched; the refund is its own record.
            case "REFUND" -> refunds.save(FeeRefund.builder().id("RF-" + r.getId()).paymentId(str(p, "paymentId")).amount(num(p, "amount"))
                    .reason(str(p, "reason")).status("APPROVED").createdAt(Teaching.now()).build());
            case "EXAM_SCHEDULE" -> exams.findById(str(p, "examId")).ifPresent(e -> {
                e.setStartsOn(str(p, "newStartsOn"));
                exams.save(e);
            });
            case "FEE_STRUCTURE" -> feeStructureCharges(p).forEach(c -> {
                c.setAmount(num(p, "newSchoolFee"));
                charges.save(c);
            });
            case "CLEARANCE_RULE" -> exams.findById(str(p, "examId")).ifPresent(e -> {
                e.setClearanceCategoriesCsv(String.join(",", strList(p, "categories")));
                e.setClearanceUptoInstalment((int) num(p, "uptoInstalment"));
                exams.save(e);
            });
            default -> {
                // LATE_FEE_WAIVER: late fees are not modelled yet; the decision is still recorded and audited.
            }
        }
        history(r, actor, "EXECUTED", null);
    }

    /** Plain-language lines for review screens. */
    public List<String> describe(Map<String, Object> p) {
        java.util.function.Function<String, String> name = sid -> students.findById(sid)
                .map(s -> s.getName() + " (" + ParentDataService.gradeOf(s) + "-" + s.getSection() + ")").orElse(sid);
        return switch (str(p, "kind")) {
            case "FEE_CONCESSION" -> List.of("Student: " + name.apply(str(p, "studentId")),
                    "Type: " + str(p, "concessionKind").replace('_', ' ').toLowerCase(),
                    ParentDataService.inr(num(p, "amountPerCharge")) + " on each of " + strList(p, "chargeIds").size() + " charge(s)",
                    "Justification: " + str(p, "justification"));
            case "REFUND" -> {
                FeePayment pay = payments.findById(str(p, "paymentId")).orElse(null);
                yield List.of("Original payment: " + (pay == null ? "?" : pay.getReceiptNo() + " · " + ParentDataService.inr(pay.getAmount()) + " · " + name.apply(pay.getStudentId())),
                        "Refund: " + ParentDataService.inr(num(p, "amount")), "Reason: " + str(p, "reason"),
                        "The original payment record is kept; the refund is a separate record.");
            }
            case "LATE_FEE_WAIVER" -> List.of("Student: " + name.apply(str(p, "studentId")), "Waive " + ParentDataService.inr(num(p, "amount")), "Reason: " + str(p, "reason"));
            case "EXAM_SCHEDULE" -> {
                ExamWindow e = exams.findById(str(p, "examId")).orElse(null);
                yield List.of("Exam: " + (e == null ? "?" : e.getName()), "From " + (e == null ? "?" : e.getStartsOn()) + " to " + str(p, "newStartsOn"), "Reason: " + str(p, "reason"));
            }
            case "FEE_STRUCTURE" -> List.of("Class " + num(p, "grade") + ", instalment " + num(p, "instalment") + ": school fee " + ParentDataService.inr(num(p, "newSchoolFee")),
                    "Reason: " + str(p, "reason"));
            case "CLEARANCE_RULE" -> {
                ExamWindow e = exams.findById(str(p, "examId")).orElse(null);
                if (e == null) yield List.of("Exam " + str(p, "examId") + " not found");
                java.util.function.BiFunction<List<String>, Integer, String> rule = (cats, upto) ->
                        String.join(", ", cats.stream().map(c -> CATEGORY_NAME.getOrDefault(c, c)).toList()) + " up to instalment " + upto;
                yield List.of("Exam: " + e.getName() + " (starts " + e.getStartsOn() + ")",
                        "Now: " + rule.apply(List.of(e.getClearanceCategoriesCsv().split(",")), e.getClearanceUptoInstalment()),
                        "Proposed: " + rule.apply(strList(p, "categories"), (int) num(p, "uptoInstalment")),
                        "A hall ticket still needs Class Teacher release; payment alone never releases it.",
                        "Reason: " + str(p, "reason"));
            }
            default -> List.of();
        };
    }

    public Map<String, Object> view(ChangeRequest r) {
        Map<String, Object> p = t.read(r.getPayloadJson(), MAP);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", r.getId());
        m.put("schoolId", r.getSchoolId());
        m.put("kind", r.getKind());
        m.put("title", r.getTitle());
        m.put("payload", p);
        m.put("payloadHash", r.getPayloadHash());
        if (r.getApprovedHash() != null) m.put("approvedHash", r.getApprovedHash());
        m.put("status", r.getStatus());
        m.put("preparedBy", r.getPreparedBy());
        m.put("preparedByName", r.getPreparedByName());
        m.put("validationIssues", validate(p));
        m.put("history", t.read(r.getHistoryJson(), LIST));
        m.put("description", describe(p));
        return m;
    }

    // ================================================================== Admin

    @Transactional(readOnly = true)
    public List<Map<String, Object>> listForAdmin(SchoolPrincipal p) {
        if (p.role() != UserRole.ADMIN) throw Teaching.denied("This is an Admin view.");
        return requests.findAll().stream().map(this::view).toList();
    }

    @Transactional
    public Map<String, Object> createDraft(SchoolPrincipal p, String title, Map<String, Object> payload) {
        String kind = str(payload, "kind");
        if (!PERMISSION_FOR_KIND.containsKey(kind)) throw Teaching.rule("KIND", "Unknown change type.");
        requirePermission(p, PERMISSION_FOR_KIND.get(kind));
        ChangeRequest r = ChangeRequest.builder().id("CR-" + t.school() + "-" + UUID.randomUUID().toString().substring(0, 8)).kind(kind)
                .title(title == null || title.isBlank() ? kind : title.trim()).payloadJson(t.write(payload)).payloadHash(hash(payload)).status("DRAFT")
                .preparedBy(p.account().getId()).preparedByName(p.account().getName()).historyJson("[]").build();
        history(r, p, "DRAFTED", null);
        return view(requests.save(r));
    }

    @Transactional
    public Map<String, Object> updateDraft(SchoolPrincipal p, String id, Map<String, Object> payload) {
        ChangeRequest r = find(id);
        requirePermission(p, PERMISSION_FOR_KIND.get(r.getKind()));
        if (!List.of("DRAFT", "RETURNED", "APPROVED", "EXECUTION_BLOCKED").contains(r.getStatus())) throw Teaching.rule("LOCKED", "This request can no longer be edited.");
        if (!r.getKind().equals(str(payload, "kind"))) throw Teaching.rule("KIND", "Change type cannot be switched.");
        r.setPayloadJson(t.write(payload));
        r.setPayloadHash(hash(payload));
        history(r, p, "APPROVED".equals(r.getStatus()) ? "EDITED_AFTER_APPROVAL" : "EDITED", null);
        return view(requests.save(r));
    }

    @Transactional
    public Map<String, Object> submit(SchoolPrincipal p, String id) {
        ChangeRequest r = find(id);
        requirePermission(p, PERMISSION_FOR_KIND.get(r.getKind()));
        boolean changedAfterApproval = "APPROVED".equals(r.getStatus()) && !r.getPayloadHash().equals(r.getApprovedHash());
        if (!List.of("DRAFT", "RETURNED", "EXECUTION_BLOCKED").contains(r.getStatus()) && !changedAfterApproval) {
            throw Teaching.rule("STATE", "Only drafts or changed requests can be submitted.");
        }
        List<String> issues = validate(t.read(r.getPayloadJson(), MAP));
        if (!issues.isEmpty()) throw Teaching.rule("INVALID", "Fix before submitting: " + String.join(" ", issues));
        r.setStatus("PENDING_APPROVAL");
        r.setApprovedHash(null);
        history(r, p, "SUBMITTED", null);
        return view(requests.save(r));
    }

    @Transactional(noRollbackFor = AuthFlowException.class)
    public Map<String, Object> execute(SchoolPrincipal p, String id) {
        ChangeRequest r = find(id);
        requirePermission(p, PERMISSION_FOR_KIND.get(r.getKind()));
        if (!"APPROVED".equals(r.getStatus())) throw Teaching.rule("STATE", "Only approved requests can be executed.");
        if (!r.getPayloadHash().equals(r.getApprovedHash())) {
            r.setStatus("EXECUTION_BLOCKED");
            history(r, p, "EXECUTION_BLOCKED", "Changed after approval; a new approval is required.");
            requests.save(r);
            throw new AuthFlowException("CHANGED_AFTER_APPROVAL", "Blocked: this request changed after the Principal approved it. Submit it again for approval.", null, 409);
        }
        Map<String, Object> payload = t.read(r.getPayloadJson(), MAP);
        List<String> issues = validate(payload);
        if (!issues.isEmpty()) {
            r.setStatus("EXECUTION_BLOCKED");
            history(r, p, "EXECUTION_BLOCKED", String.join(" ", issues));
            requests.save(r);
            throw new AuthFlowException("INVALID", "Blocked by fresh validation: " + String.join(" ", issues), null, 409);
        }
        apply(r, payload, p);
        r.setStatus("EXECUTED");
        requests.save(r);
        t.record(p, "GOVERNANCE_EXECUTED", r.getId(), r.getTitle(), null);
        return view(r);
    }

    // ================================================================== Principal

    @Transactional(readOnly = true)
    public List<Map<String, Object>> listForPrincipal(SchoolPrincipal p) {
        if (p.role() != UserRole.PRINCIPAL) throw Teaching.denied("Only the Principal approves.");
        return requests.findAll().stream().filter(r -> !"DRAFT".equals(r.getStatus()))
                .sorted(Comparator.comparingInt(r -> PRINCIPAL_ORDER.getOrDefault(r.getStatus(), 9))).map(this::view).toList();
    }

    @Transactional(noRollbackFor = AuthFlowException.class)
    public Map<String, Object> principalDecide(SchoolPrincipal p, String id, String decision, String note, String stepUpToken) {
        if (p.role() != UserRole.PRINCIPAL) throw Teaching.denied("Only the Principal approves.");
        ChangeRequest r = find(id);
        if (!"PENDING_APPROVAL".equals(r.getStatus())) throw Teaching.rule("STATE", "This request is not waiting for approval.");
        String n = note == null ? "" : note.trim();
        if (!"APPROVE".equals(decision) && n.length() < 5) throw Teaching.rule("REASON", "Add a note for the Admin.");
        switch (decision == null ? "" : decision) {
            case "APPROVE" -> {
                if (!signIn.consumeStepUp(stepUpToken, "SENSITIVE_STAFF_ACTION", p.session())) {
                    throw new AuthFlowException("STEP_UP_REQUIRED", "Please confirm with the OTP again.", null, 401);
                }
                List<String> issues = validate(t.read(r.getPayloadJson(), MAP));
                if (!issues.isEmpty()) throw Teaching.rule("INVALID", "Cannot approve: " + String.join(" ", issues));
                r.setStatus("APPROVED");
                r.setApprovedHash(r.getPayloadHash());
            }
            case "RETURN" -> r.setStatus("RETURNED");
            case "REJECT" -> r.setStatus("REJECTED");
            default -> throw Teaching.rule("BAD_DECISION", "Approve, return or reject.");
        }
        history(r, p, "APPROVE".equals(decision) ? "APPROVED" : "RETURN".equals(decision) ? "RETURNED" : "REJECTED", n);
        requests.save(r);
        t.record(p, "GOVERNANCE_" + decision, r.getId(), r.getTitle(), n.isEmpty() ? null : n);
        return view(r);
    }
}
