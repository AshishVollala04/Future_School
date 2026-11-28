package com.futureschool.backend.parent;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.futureschool.backend.auth.AuthFlowException;
import com.futureschool.backend.auth.SignInService;
import com.futureschool.backend.entity.*;
import com.futureschool.backend.parent.ParentViews.*;
import com.futureschool.backend.repository.*;
import com.futureschool.backend.security.SchoolPrincipal;
import com.futureschool.backend.tenant.TenantContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.*;
import java.util.*;
import java.util.stream.Collectors;

/**
 * The parent's view of ONE child: the child of the current session (never a client parameter).
 * Every repository call is school-filtered by the session's school.
 *
 * Fees: the server computes amounts and allocations; the client cannot change them.
 * Payment (prototype): a mock provider confirmation that requires a fresh, single-use step-up OTP
 * of purpose PAYMENT, and re-validates the dues at confirmation time. No card/UPI data is accepted.
 * Hall ticket: available only when fees are cleared under the exam's rule AND the Class Teacher
 * released it (or an audited Principal override). Payment alone never releases it.
 */
@Service
public class ParentDataService {

    public static final ZoneId SCHOOL_ZONE = ZoneId.of("Asia/Kolkata");
    static final long PARTIAL_MINIMUM = 1000;
    static final Duration ORDER_TTL = Duration.ofMinutes(15);
    private static final Set<String> METHODS = Set.of("UPI", "CARD", "NETBANKING");
    private static final Map<String, String> CATEGORY_LABEL = Map.of(
            "SCHOOL_FEE", "School fee", "TRANSPORT_FEE", "Transport fee", "EXAM_FEE", "Exam fee",
            "ACTIVITY_FEE", "Activity fee", "EVENT_FEE", "Event fee", "OTHER", "Other");

    private final StudentRepository students;
    private final SchoolRepository schools;
    private final FeeInstalmentRepository instalments;
    private final FeeChargeRepository charges;
    private final FeeConcessionRepository concessions;
    private final FeePaymentRepository payments;
    private final FeeRefundRepository refunds;
    private final PaymentOrderRepository orders;
    private final ExamWindowRepository exams;
    private final HallTicketReleaseRepository releases;
    private final StudentAttendanceDayRepository attendance;
    private final PublishedResultRepository results;
    private final AuditEventRepository audit;
    private final LoginSessionRepository sessions;
    private final SignInService signIn;
    private final PaymentGateway gateway;
    private final ClassSubjectTeacherRepository subjectTeachers;
    private final AcademicYearRepository academicYears;
    private final TransactionTemplate perSchoolTx;
    private final ObjectMapper json;
    private SchoolClassRepository classes;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    public void setClasses(SchoolClassRepository classes) {
        this.classes = classes;
    }

    public ParentDataService(StudentRepository students, SchoolRepository schools, FeeInstalmentRepository instalments, FeeChargeRepository charges,
                             FeeConcessionRepository concessions, FeePaymentRepository payments, FeeRefundRepository refunds,
                             PaymentOrderRepository orders, ExamWindowRepository exams, HallTicketReleaseRepository releases,
                             StudentAttendanceDayRepository attendance, PublishedResultRepository results,
                             AuditEventRepository audit, LoginSessionRepository sessions,
                             SignInService signIn, PaymentGateway gateway, ClassSubjectTeacherRepository subjectTeachers,
                             AcademicYearRepository academicYears, PlatformTransactionManager txManager, ObjectMapper json) {
        this.students = students;
        this.schools = schools;
        this.instalments = instalments;
        this.charges = charges;
        this.concessions = concessions;
        this.payments = payments;
        this.refunds = refunds;
        this.orders = orders;
        this.exams = exams;
        this.releases = releases;
        this.attendance = attendance;
        this.results = results;
        this.audit = audit;
        this.sessions = sessions;
        this.signIn = signIn;
        this.gateway = gateway;
        this.subjectTeachers = subjectTeachers;
        this.academicYears = academicYears;
        this.perSchoolTx = new TransactionTemplate(txManager);
        this.perSchoolTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.json = json;
    }

    public static String today() {
        return LocalDate.now(SCHOOL_ZONE).toString();
    }

    /** The session's child, re-read through the school filter. */
    Student child(SchoolPrincipal p) {
        String id = p == null ? null : p.sessionStudentId();
        if (id == null) throw new AuthFlowException("NO_STUDENT", "Choose a child first.", null, 403);
        return students.findById(id).orElseThrow(() -> new AuthFlowException("NOT_FOUND", "Student not found in this school.", null, 404));
    }

    public static int gradeOf(Student s) {
        String d = s.getClassName() == null ? "" : s.getClassName().replaceAll("[^0-9]", "");
        return d.isEmpty() ? 0 : Integer.parseInt(d);
    }

    /** Child + class + subject-teacher overview for the Parent profile & home pages. */
    @Transactional(readOnly = true)
    public Map<String, Object> overview(SchoolPrincipal p) {
        Student s = child(p);
        SchoolClass cls = classes == null ? null : classes.findById(s.getClassId()).orElse(null);
        int grade = gradeOf(s);
        Map<String, Object> studentDto = new LinkedHashMap<>();
        studentDto.put("id", s.getId());
        studentDto.put("schoolId", p.schoolId());
        studentDto.put("classSectionId", s.getClassId());
        studentDto.put("name", s.getName());
        studentDto.put("grade", grade);
        studentDto.put("section", s.getSection());
        studentDto.put("rollNumber", s.getRoll());
        studentDto.put("admissionNo", s.getAdmissionNumber());
        if (s.getTransportRouteId() != null) studentDto.put("transportRouteId", s.getTransportRouteId());
        if (s.getTransportStop() != null) studentDto.put("transportStop", s.getTransportStop());
        String st = s.getStatus() == null ? "ACTIVE" : s.getStatus().toUpperCase(Locale.ROOT);
        studentDto.put("status", List.of("ACTIVE", "TRANSFERRED", "EXITED").contains(st) ? st : "ACTIVE");

        List<Map<String, Object>> subjList = subjectTeachers.findByClassIdOrderByIdAsc(s.getClassId()).stream()
                .map(x -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("subject", x.getSubject());
                    m.put("staffId", x.getStaffId());
                    m.put("name", x.getStaffName());
                    return m;
                }).toList();

        Map<String, Object> csDto = new LinkedHashMap<>();
        csDto.put("id", s.getClassId());
        csDto.put("schoolId", p.schoolId());
        csDto.put("grade", cls != null && cls.getGradeNumber() != null ? cls.getGradeNumber() : grade);
        csDto.put("section", cls != null ? cls.getSection() : s.getSection());
        csDto.put("classTeacherStaffId", cls != null && cls.getClassTeacherId() != null ? cls.getClassTeacherId() : "");
        csDto.put("classTeacherName", cls != null && cls.getClassTeacherName() != null ? cls.getClassTeacherName() : "");
        csDto.put("subjectTeachers", subjList);

        return Map.of("student", studentDto, "classSection", csDto);
    }

    // ================================================================== fees

    /** Pure fee arithmetic, shared with hall tickets. */
    public List<FeeLine> feeLines(String studentId, String today) {
        List<FeeCharge> cs = charges.findByStudentIdOrderByDueOnAscIdAsc(studentId);
        Set<String> ids = cs.stream().map(FeeCharge::getId).collect(Collectors.toSet());
        Map<String, Long> con = new HashMap<>();
        if (!ids.isEmpty()) concessions.findByChargeIdIn(ids).forEach(k -> con.merge(k.getChargeId(), k.getAmount(), Long::sum));
        Map<String, Long> paid = new HashMap<>();
        payments.findByStudentIdOrderByPaidAtDesc(studentId).forEach(p -> p.getAllocations().forEach(a -> paid.merge(a.getChargeId(), a.getAmount(), Long::sum)));
        return cs.stream().map(c -> {
            long concession = con.getOrDefault(c.getId(), 0L);
            long pd = paid.getOrDefault(c.getId(), 0L);
            long outstanding = Math.max(0, c.getAmount() - concession - pd);
            return new FeeLine(new Charge(c.getId(), c.getSchoolId(), c.getStudentId(), c.getCategory(), c.getInstalment(), c.getLabel(), c.getAmount(), c.getDueOn(),
                    c.getAcademicYearId()),
                    concession, pd, outstanding, outstanding > 0 && c.getDueOn().compareTo(today) < 0);
        }).toList();
    }

    @Transactional(readOnly = true)
    public FeeSummary feeSummary(SchoolPrincipal p) {
        return summaryFor(child(p));
    }

    /** Fee summary for any student of the current school (staff fee desk uses this too). */
    @Transactional(readOnly = true)
    public FeeSummary summaryFor(Student s) {
        String today = today();
        List<FeeLine> lines = feeLines(s.getId(), today);
        // One summary per instalment PER YEAR: the current year's schedule, plus any other year this
        // student has charges in (e.g. last year's arrears or next year's fees), oldest year first.
        String currentId = academicYears.findByIsCurrentTrue().map(AcademicYear::getId).orElse(null);
        Map<String, AcademicYear> yearsById = academicYears.findAll().stream().collect(Collectors.toMap(AcademicYear::getId, y -> y));
        Set<String> yearsWithCharges = lines.stream().map(l -> l.charge().academicYearId() != null ? l.charge().academicYearId() : currentId)
                .filter(java.util.Objects::nonNull).collect(Collectors.toSet());
        List<InstalmentSummary> ins = instalments.findAllByOrderByNumberAsc().stream()
                .filter(i -> {
                    String y = i.getAcademicYearId() != null ? i.getAcademicYearId() : currentId;
                    return y == null || y.equals(currentId) || yearsWithCharges.contains(y);
                })
                .sorted(Comparator.comparing((FeeInstalment i) -> {
                    AcademicYear y = yearsById.get(i.getAcademicYearId() != null ? i.getAcademicYearId() : String.valueOf(currentId));
                    return y == null ? LocalDate.MIN : y.getStartDate();
                }).thenComparing(FeeInstalment::getNumber))
                .map(i -> {
                    String yearId = i.getAcademicYearId() != null ? i.getAcademicYearId() : currentId;
                    List<FeeLine> l = lines.stream()
                            .filter(x -> x.charge().instalment() == i.getNumber()
                                    && com.futureschool.backend.roster.AcademicYearService.sameYear(x.charge().academicYearId(), yearId, currentId))
                            .toList();
                    AcademicYear y = yearId == null ? null : yearsById.get(yearId);
                    return new InstalmentSummary(i.getNumber(), i.getLabel(), i.getDueOn(), l, l.stream().mapToLong(FeeLine::outstanding).sum(),
                            l.stream().anyMatch(FeeLine::overdue), yearId, y == null ? null : y.getName());
                }).toList();
        NextDue next = ins.stream().filter(i -> i.outstanding() > 0).findFirst()
                .map(i -> new NextDue(new Instalment(i.number(), i.label(), i.dueOn()), i.outstanding())).orElse(null);
        String policy = schools.findById(TenantContext.require()).map(School::getLateFeePolicy).orElse(null);
        return new FeeSummary(ins,
                lines.stream().mapToLong(l -> l.charge().amount()).sum(),
                lines.stream().mapToLong(FeeLine::concession).sum(),
                lines.stream().mapToLong(FeeLine::paid).sum(),
                lines.stream().mapToLong(FeeLine::outstanding).sum(),
                lines.stream().filter(FeeLine::overdue).mapToLong(FeeLine::outstanding).sum(),
                next, policy);
    }

    @Transactional(readOnly = true)
    public Payments listPayments(SchoolPrincipal p) {
        return paymentsFor(child(p));
    }

    @Transactional(readOnly = true)
    public Payments paymentsFor(Student s) {
        List<FeePayment> ps = payments.findByStudentIdOrderByPaidAtDesc(s.getId());
        Set<String> ids = ps.stream().map(FeePayment::getId).collect(Collectors.toSet());
        List<Refund> rf = ids.isEmpty() ? List.of() : refunds.findByPaymentIdIn(ids).stream()
                .map(r -> new Refund(r.getId(), r.getPaymentId(), r.getAmount(), r.getReason(), r.getStatus(), r.getCreatedAt())).toList();
        return new Payments(ps.stream().map(this::view).toList(), rf);
    }

    public Payment view(FeePayment x) {
        return new Payment(x.getId(), x.getSchoolId(), x.getStudentId(), x.getAmount(), x.getMethod(), x.getProviderRef(), x.getPaidAt(),
                x.getPaidByGuardianId(), x.getRecordedByStaffId(), x.getReceiptNo(),
                x.getAllocations().stream().map(a -> new Allocation(a.getChargeId(), a.getAmount())).toList(), Boolean.TRUE.equals(x.getMock()));
    }

    public static List<Allocation> allocate(List<FeeLine> lines, long amount) {
        List<Allocation> out = new ArrayList<>();
        long left = amount;
        for (FeeLine l : lines) {
            if (left <= 0) break;
            if (l.outstanding() <= 0) continue;
            long take = Math.min(left, l.outstanding());
            out.add(new Allocation(l.charge().id(), take));
            left -= take;
        }
        return out;
    }

    /** Whole instalments, or a part amount allocated oldest-due first. The server decides the allocation. */
    @Transactional(noRollbackFor = AuthFlowException.class)
    public Order createOrder(SchoolPrincipal p, List<Integer> instalmentNumbers, Long amount) {
        return createOrder(p, instalmentNumbers, amount, null);
    }

    /**
     * Whole instalments, or a part amount allocated oldest-due first. The server decides the allocation.
     * In Razorpay mode, a fresh PAYMENT PIN/OTP step-up token is required before opening checkout.
     */
    @Transactional(noRollbackFor = AuthFlowException.class)
    public Order createOrder(SchoolPrincipal p, List<Integer> instalmentNumbers, Long amount, String stepUpToken) {
        Student s = child(p);
        List<FeeLine> lines = feeLines(s.getId(), today());
        long total = lines.stream().mapToLong(FeeLine::outstanding).sum();
        if (total <= 0) throw new AuthFlowException("NOTHING_DUE", "There is nothing to pay.", null, 400);
        List<Allocation> alloc;
        if (instalmentNumbers != null && !instalmentNumbers.isEmpty()) {
            alloc = lines.stream().filter(l -> instalmentNumbers.contains(l.charge().instalment()) && l.outstanding() > 0)
                    .map(l -> new Allocation(l.charge().id(), l.outstanding())).toList();
        } else {
            long a = amount == null ? 0 : amount;
            if (a <= 0) throw new AuthFlowException("BAD_AMOUNT", "Enter an amount.", null, 400);
            if (a > total) throw new AuthFlowException("BAD_AMOUNT", "Amount is more than the outstanding balance.", null, 400);
            if (a < Math.min(PARTIAL_MINIMUM, total)) throw new AuthFlowException("BAD_AMOUNT", "Minimum part payment is ₹1,000.", null, 400);
            alloc = allocate(lines, a);
        }
        long sum = alloc.stream().mapToLong(Allocation::amount).sum();
        if (sum <= 0) throw new AuthFlowException("NOTHING_DUE", "Selected instalments are already paid.", null, 400);

        boolean stepUpVerified = false;
        if (gateway.isRazorpay()) {
            if (!signIn.consumeStepUp(stepUpToken, "PAYMENT", p.session())) {
                throw new AuthFlowException("STEP_UP_REQUIRED", "Please confirm with your PIN or OTP first.", null, 401);
            }
            stepUpVerified = true;
        } else if (stepUpToken != null && !stepUpToken.isBlank()) {
            if (!signIn.consumeStepUp(stepUpToken, "PAYMENT", p.session())) {
                throw new AuthFlowException("STEP_UP_REQUIRED", "Please confirm with the OTP again.", null, 401);
            }
            stepUpVerified = true;
        }

        Instant exp = Instant.now().plus(ORDER_TTL);
        String schoolId = TenantContext.require();
        String localId = (gateway.isRazorpay() ? "ord_" : "order_mock_") + UUID.randomUUID().toString().replace("-", "");
        PaymentGateway.ProviderOrder po = gateway.createOrder(localId, sum, schoolId, s.getId());
        PaymentOrder o = orders.save(PaymentOrder.builder()
                .id(localId)
                .studentId(s.getId())
                .sessionId(p.session().getId())
                .amount(sum)
                .allocationsJson(write(alloc))
                .expiresAt(exp)
                .consumed(false)
                .provider(gateway.provider())
                .providerOrderId(po.providerOrderId())
                .stepUpVerified(stepUpVerified)
                .build());
        return new Order(o.getId(), s.getId(), sum, alloc, exp.toEpochMilli(), !gateway.isRazorpay(),
                gateway.provider(), gateway.keyId(), gateway.isRazorpay() ? po.providerOrderId() : null,
                po.amountPaise(), po.currency(),
                gateway.isRazorpay() ? p.account().getName() : null,
                gateway.isRazorpay() ? p.account().getMobile() : null);
    }

    /**
     * Prototype stand-in for "provider webhook verified". Requires a fresh step-up OTP token for
     * PAYMENT bound to this session, and re-validates the dues (they may have changed).
     */
    @Transactional(noRollbackFor = AuthFlowException.class)
    public Payment confirmMockPayment(SchoolPrincipal p, String orderId, String method, String stepUpToken) {
        if (gateway.isRazorpay()) {
            throw new AuthFlowException("RAZORPAY_REQUIRED", "Use Razorpay verification when gateway is live.", null, 400);
        }
        Student s = child(p);
        PaymentOrder o = loadOwnedOrder(p, s, orderId);
        if (!"mock".equals(o.getProvider())) {
            throw new AuthFlowException("RAZORPAY_REQUIRED", "Use Razorpay verification for this order.", null, 400);
        }
        if (Boolean.TRUE.equals(o.getConsumed())) {
            throw new AuthFlowException("NO_ORDER", "Payment session not found. Start again.", null, 404);
        }
        if (Instant.now().isAfter(o.getExpiresAt())) {
            o.setConsumed(true);
            orders.save(o);
            throw new AuthFlowException("ORDER_EXPIRED", "Payment session expired. Start again.", null, 400);
        }
        if (!METHODS.contains(method)) throw new AuthFlowException("BAD_METHOD", "Choose UPI, card or net banking.", null, 400);
        if (!Boolean.TRUE.equals(o.getStepUpVerified()) && !signIn.consumeStepUp(stepUpToken, "PAYMENT", p.session())) {
            throw new AuthFlowException("STEP_UP_REQUIRED", "Please confirm with the OTP again.", null, 401);
        }
        return settleOrder(o, s, method, o.getId(), true, p.account().getId(), "PARENT");
    }

    /**
     * Verifies a Razorpay Checkout payment signature (HMAC-SHA256) and records the payment idempotently.
     * In mock mode, falls back to mock verification when the order belongs to mock provider.
     */
    @Transactional(noRollbackFor = AuthFlowException.class)
    public Payment verifyPayment(SchoolPrincipal p, String orderId, String razorpayOrderId, String razorpayPaymentId,
                                 String razorpaySignature, String method, String stepUpToken) {
        Student s = child(p);
        PaymentOrder o = loadOwnedOrder(p, s, orderId);
        if (o.getPaymentId() != null) {
            return existingPaymentOrThrow(o);
        }
        if ("mock".equals(o.getProvider()) && !gateway.isRazorpay()) {
            return confirmMockPayment(p, orderId, method == null || method.isBlank() ? "UPI" : method, stepUpToken);
        }
        if (Boolean.TRUE.equals(o.getConsumed())) {
            throw new AuthFlowException("NO_ORDER", "Payment session not found. Start again.", null, 404);
        }
        if (Instant.now().isAfter(o.getExpiresAt())) {
            o.setConsumed(true);
            orders.save(o);
            throw new AuthFlowException("ORDER_EXPIRED", "Payment session expired. Start again.", null, 400);
        }
        if (!Boolean.TRUE.equals(o.getStepUpVerified()) && !signIn.consumeStepUp(stepUpToken, "PAYMENT", p.session())) {
            throw new AuthFlowException("STEP_UP_REQUIRED", "Please confirm with your PIN or OTP first.", null, 401);
        }
        if (razorpayOrderId == null || razorpayOrderId.isBlank() || !razorpayOrderId.equals(o.getProviderOrderId())
                || razorpayPaymentId == null || razorpayPaymentId.isBlank() || razorpaySignature == null || razorpaySignature.isBlank()) {
            throw new AuthFlowException("PAYMENT_SIGNATURE_INVALID", "Payment verification failed.", null, 401);
        }
        if (!gateway.verifyCheckoutSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
            throw new AuthFlowException("PAYMENT_SIGNATURE_INVALID", "Payment verification failed.", null, 401);
        }
        String normalizedMethod = normalizeMethod(method);
        return settleOrder(o, s, normalizedMethod, razorpayPaymentId.trim(), false, p.account().getId(), "PARENT");
    }

    /**
     * Razorpay webhook endpoint handler: verifies X-Razorpay-Signature against the raw request body,
     * switches cleanly into the order's school TenantContext, checks PIN step-up & amount, and settles idempotently.
     */
    public Map<String, Object> handleRazorpayWebhook(byte[] rawBody, String signatureHeader) {
        if (!gateway.verifyWebhookSignature(rawBody, signatureHeader)) {
            throw new AuthFlowException("BAD_SIGNATURE", "Invalid Razorpay webhook signature.", null, 401);
        }
        JsonNode root;
        try {
            root = json.readTree(rawBody);
        } catch (Exception e) {
            throw new AuthFlowException("BAD_PAYLOAD", "Invalid webhook JSON.", null, 400);
        }
        String event = root.path("event").asText("");
        if (!"payment.captured".equals(event) && !"order.paid".equals(event)) {
            return Map.of("status", "ignored", "event", event);
        }
        JsonNode payNode = root.path("payload").path("payment").path("entity");
        String rzpOrderId = payNode.path("order_id").asText("");
        String rzpPaymentId = payNode.path("id").asText("");
        long amountPaise = payNode.path("amount").asLong(-1);
        String currency = payNode.path("currency").asText("");
        String method = normalizeMethod(payNode.path("method").asText("UPI"));
        String schoolHint = payNode.path("notes").path("schoolId").asText("");
        if (rzpOrderId.isBlank() || rzpPaymentId.isBlank() || amountPaise <= 0 || !"INR".equalsIgnoreCase(currency)) {
            throw new AuthFlowException("BAD_PAYLOAD", "Webhook payment fields missing or invalid.", null, 400);
        }

        List<String> candidateSchools = new ArrayList<>();
        if (!schoolHint.isBlank() && schools.findById(schoolHint).isPresent()) {
            candidateSchools.add(schoolHint);
        }
        for (School sch : schools.findAll()) {
            if ("ACTIVE".equals(sch.getStatus()) && !candidateSchools.contains(sch.getId())) {
                candidateSchools.add(sch.getId());
            }
        }
        for (String sid : candidateSchools) {
            Map<String, Object> result = TenantContext.callAs(sid, () -> {
                try {
                    return perSchoolTx.execute(tx -> {
                        PaymentOrder o = orders.findByProviderOrderId(rzpOrderId).orElse(null);
                        if (o == null) return null;
                        if (o.getPaymentId() != null) {
                            return Map.of("status", "already_recorded", "paymentId", o.getPaymentId());
                        }
                        if (!Boolean.TRUE.equals(o.getStepUpVerified())) {
                            throw new AuthFlowException("STEP_UP_REQUIRED", "Order did not pass PIN step-up.", null, 403);
                        }
                        if (o.getAmount() * 100L != amountPaise) {
                            throw new AuthFlowException("AMOUNT_MISMATCH", "Captured amount does not match order.", null, 400);
                        }
                        boolean afterExpiry = Boolean.TRUE.equals(o.getConsumed()) || Instant.now().isAfter(o.getExpiresAt());
                        Student s = students.findById(o.getStudentId())
                                .orElseThrow(() -> new AuthFlowException("NOT_FOUND", "Student not found.", null, 404));
                        String guardianId = sessions.findById(o.getSessionId()).map(LoginSession::getAccountId).orElse(null);
                        try {
                            Payment recorded = settleOrder(o, s, method, rzpPaymentId, false, guardianId, "RAZORPAY_WEBHOOK");
                            if (afterExpiry) {
                                savePaymentAlert("PAYMENT_CAPTURED_AFTER_EXPIRY", s.getId(),
                                        "Captured Razorpay " + rzpPaymentId + " (₹" + o.getAmount() + ") arrived after payment session expired; fee recorded under receipt " + recorded.receiptNo() + ".");
                                return Map.of("status", "recorded_after_expiry", "paymentId", recorded.id(),
                                        "receiptNo", recorded.receiptNo(), "lateCaptureAlert", true);
                            }
                            return Map.of("status", "recorded", "paymentId", recorded.id(), "receiptNo", recorded.receiptNo());
                        } catch (AuthFlowException staleEx) {
                            if (!"STALE_ORDER".equals(staleEx.getCode())) throw staleEx;
                            savePaymentAlert("PAYMENT_CAPTURE_UNRECORDED", s.getId(),
                                    "ACTION NEEDED: Razorpay captured ₹" + o.getAmount() + " (" + rzpPaymentId + ") for order " + o.getId()
                                            + (afterExpiry ? " after session expiry" : "") + ", but dues changed and could not be auto-recorded. Review or refund.");
                            return Map.of("status", "unrecorded_alert", "recorded", false,
                                    "alertRecorded", true, "paymentRef", rzpPaymentId, "reason", staleEx.getMessage());
                        }
                    });
                } catch (AuthFlowException ex) {
                    if ("AMOUNT_MISMATCH".equals(ex.getCode()) || "STEP_UP_REQUIRED".equals(ex.getCode())) {
                        perSchoolTx.executeWithoutResult(status -> {
                            PaymentOrder o = orders.findByProviderOrderId(rzpOrderId).orElse(null);
                            String studentId = o != null ? o.getStudentId() : rzpOrderId;
                            savePaymentAlert("PAYMENT_WEBHOOK_ALERT", studentId,
                                    "Razorpay webhook alert for " + rzpPaymentId + " (" + ex.getCode() + "): " + ex.getMessage());
                        });
                    }
                    throw ex;
                }
            });
            if (result != null) return result;
        }
        throw new AuthFlowException("NO_ORDER", "Matching payment order not found.", null, 404);
    }

    private void savePaymentAlert(String action, String studentId, String details) {
        audit.save(AuditEvent.builder()
                .id("AUD-" + UUID.randomUUID())
                .action(action)
                .actorId("SYSTEM")
                .actorRole("RAZORPAY_WEBHOOK")
                .targetId(studentId)
                .details(details)
                .at(OffsetDateTime.now(SCHOOL_ZONE).toString())
                .build());
    }

    private PaymentOrder loadOwnedOrder(SchoolPrincipal p, Student s, String orderId) {
        PaymentOrder o = orders.findById(orderId).orElseThrow(() -> new AuthFlowException("NO_ORDER", "Payment session not found. Start again.", null, 404));
        if (!o.getStudentId().equals(s.getId()) || !o.getSessionId().equals(p.session().getId())) {
            throw new AuthFlowException("NO_ORDER", "Payment session not found. Start again.", null, 404);
        }
        return o;
    }

    private Payment existingPaymentOrThrow(PaymentOrder o) {
        FeePayment existing = payments.findById(o.getPaymentId())
                .orElseThrow(() -> new AuthFlowException("NO_ORDER", "Payment session already completed.", null, 404));
        return view(existing);
    }

    private static String normalizeMethod(String raw) {
        if (raw == null || raw.isBlank()) return "UPI";
        String up = raw.trim().toUpperCase(Locale.ROOT);
        if (!METHODS.contains(up)) throw new AuthFlowException("BAD_METHOD", "Choose UPI, card or net banking.", null, 400);
        return up;
    }

    /** Unique per-school receipt number using the current academic year, immune to concurrent count collisions. */
    public synchronized String nextReceiptNo(String school) {
        String ay = academicYears.findByIsCurrentTrue().map(AcademicYear::getName).orElse("2026-27");
        // Normalize "2026-2027" -> "2026-27" when 9 chars
        if (ay.matches("\\d{4}-\\d{4}")) ay = ay.substring(0, 5) + ay.substring(7);
        long seq = payments.count() + 1001;
        String candidate = school + "/" + ay + "/" + seq;
        while (payments.existsByReceiptNo(candidate)) {
            seq++;
            candidate = school + "/" + ay + "/" + seq;
        }
        return candidate;
    }

    private Payment settleOrder(PaymentOrder o, Student s, String method, String providerRef, boolean isMock, String guardianId, String actorRole) {
        List<Allocation> alloc = read(o.getAllocationsJson());
        Map<String, Long> outstanding = feeLines(s.getId(), today()).stream().collect(Collectors.toMap(l -> l.charge().id(), FeeLine::outstanding));
        for (Allocation a : alloc) {
            if (outstanding.getOrDefault(a.chargeId(), 0L) < a.amount()) {
                o.setConsumed(true);
                orders.save(o);
                throw new AuthFlowException("STALE_ORDER", "Your dues changed. Please start the payment again.", null, 409);
            }
        }
        String school = TenantContext.require();
        String payId = "PAY-" + school + "-" + UUID.randomUUID().toString().substring(0, 8);
        String receiptNo = nextReceiptNo(school);
        o.setConsumed(true);
        o.setPaymentId(payId);
        orders.save(o);
        String now = OffsetDateTime.now(SCHOOL_ZONE).toString();
        FeePayment pay = payments.save(FeePayment.builder()
                .id(payId)
                .studentId(s.getId()).amount(o.getAmount()).method(method).providerRef(providerRef)
                .paidAt(now).paidByGuardianId(guardianId)
                .receiptNo(receiptNo).mock(isMock)
                .allocations(new ArrayList<>(alloc.stream().map(a -> new PaymentAllocation(a.chargeId(), a.amount())).toList()))
                .build());
        audit.save(AuditEvent.builder()
                .id("AUD-" + UUID.randomUUID())
                .action("FEE_PAYMENT_RECORDED")
                .actorId(guardianId != null ? guardianId : "SYSTEM")
                .actorRole(actorRole)
                .targetId(s.getId())
                .details(receiptNo + " · ₹" + o.getAmount() + " · " + method + (isMock ? " (mock)" : " · Razorpay " + providerRef))
                .at(now)
                .build());
        return view(pay);
    }

    private String write(List<Allocation> a) {
        try {
            return json.writeValueAsString(a);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private List<Allocation> read(String s) {
        try {
            return json.readValue(s, new TypeReference<List<Allocation>>() {
            });
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    // ================================================================== attendance & results

    @Transactional(readOnly = true)
    public AttendanceSummary attendance(SchoolPrincipal p, int days) {
        Student s = child(p);
        int d = Math.max(1, Math.min(days, 200));
        String today = today();
        String from = LocalDate.now(SCHOOL_ZONE).minusDays(d).toString();
        List<AttendanceDay> list = attendance.findByStudentIdAndDateGreaterThanEqualOrderByDateAsc(s.getId(), from).stream()
                // Today shows only once the Class Teacher has marked something.
                .filter(x -> x.getDate().compareTo(today) < 0 || !"-".equals(x.getMorning()) || !"-".equals(x.getAfternoon()))
                .map(x -> new AttendanceDay(x.getDate(), x.getMorning(), x.getAfternoon())).toList();
        int working = 0, present = 0;
        for (AttendanceDay x : list) {
            working += (!"-".equals(x.morning()) ? 1 : 0) + (!"-".equals(x.afternoon()) ? 1 : 0);
            present += ("P".equals(x.morning()) ? 1 : 0) + ("P".equals(x.afternoon()) ? 1 : 0);
        }
        double pct = working == 0 ? 0 : Math.round(present * 1000.0 / working) / 10.0;
        return new AttendanceSummary(list, working, present, pct,
                (int) list.stream().filter(x -> "A".equals(x.morning()) && "A".equals(x.afternoon())).count(),
                (int) list.stream().filter(x -> "L".equals(x.morning())).count());
    }

    /** CURRENT first, then newest. Absent is "AB", never 0. */
    @Transactional(readOnly = true)
    public List<Result> results(SchoolPrincipal p) {
        Student s = child(p);
        return results.findByStudentId(s.getId()).stream()
                .sorted(Comparator.comparing((PublishedResult r) -> !"CURRENT".equals(r.getStatus()))
                        .thenComparing(PublishedResult::getPublishedOn, Comparator.reverseOrder())
                        .thenComparing(PublishedResult::getVersion, Comparator.reverseOrder()))
                .map(r -> new Result(r.getId(), r.getStudentId(), r.getExamName(), r.getVersion(), r.getStatus(), r.getPublishedOn(),
                        readSubjects(r.getSubjectsJson()), r.getClassTeacherRemark()))
                .toList();
    }

    private List<Subject> readSubjects(String s) {
        try {
            return json.readValue(s, new TypeReference<List<Subject>>() {
            });
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    // ================================================================== hall tickets

    @Transactional(readOnly = true)
    public List<HallTicket> hallTickets(SchoolPrincipal p) {
        Student s = child(p);
        int grade = gradeOf(s);
        String today = today();
        return exams.findByStartsOnGreaterThanEqualOrderByStartsOnAsc(today).stream()
                .filter(e -> grades(e).contains(grade))
                .map(e -> hallTicket(e, s, grade, today)).toList();
    }

    public HallTicket hallTicket(ExamWindow e, Student s, int grade, String today) {
        List<String> cats = List.of(e.getClearanceCategoriesCsv().split(","));
        // The exam's clearance rule applies to the fees of the exam's own academic year (the year whose
        // dates contain the exam; the current year when none is recorded), never to another year's terms.
        String currentId = academicYears.findByIsCurrentTrue().map(AcademicYear::getId).orElse(null);
        LocalDate examDay = LocalDate.parse(e.getStartsOn().substring(0, 10));
        String examYearId = academicYears.findAll().stream()
                .filter(y -> !examDay.isBefore(y.getStartDate()) && !examDay.isAfter(y.getEndDate()))
                .map(AcademicYear::getId).findFirst().orElse(currentId);
        Map<Integer, String> insLabel = instalments.findAllByOrderByNumberAsc().stream()
                .filter(i -> com.futureschool.backend.roster.AcademicYearService.sameYear(i.getAcademicYearId(), examYearId, currentId))
                .collect(Collectors.toMap(FeeInstalment::getNumber, FeeInstalment::getLabel, (a, b) -> a));
        List<String> pending = feeLines(s.getId(), today).stream()
                .filter(l -> com.futureschool.backend.roster.AcademicYearService.sameYear(l.charge().academicYearId(), examYearId, currentId))
                .filter(l -> cats.contains(l.charge().category()) && l.charge().instalment() <= e.getClearanceUptoInstalment() && l.outstanding() > 0)
                .map(l -> insLabel.getOrDefault(l.charge().instalment(), "Instalment " + l.charge().instalment()) + ": "
                        + CATEGORY_LABEL.getOrDefault(l.charge().category(), l.charge().category()) + " " + inr(l.outstanding()) + " pending")
                .toList();
        String clearance = pending.isEmpty() ? "CLEARED" : "PENDING";
        Release rel = releases.findByExamIdAndStudentId(e.getId(), s.getId())
                .map(r -> new Release(r.getExamId(), r.getStudentId(), r.getReleasedBy(), r.getReleasedAt(),
                        r.getOverrideReason() == null ? null : new ParentViews.Override(r.getOverrideReason(), r.getOverrideBy(), r.getOverrideAt())))
                .orElse(null);
        boolean available = "CLEARED".equals(clearance) && rel != null;
        Exam exam = new Exam(e.getId(), e.getSchoolId(), e.getName(), e.getStartsOn(), grades(e), new ClearanceRule(cats, e.getClearanceUptoInstalment()));
        List<ExamSubject> subjects = buildExamSchedule(s.getClassId(), e.getStartsOn(), grade + "-" + s.getSection());
        return new HallTicket(exam, new StudentRef(s.getId(), s.getName(), s.getRoll(), grade, s.getSection()), clearance, pending, rel, available,
                available ? e.getName() + "-" + grade + s.getSection() + "-" + s.getRoll() : null, subjects);
    }

    private List<ExamSubject> buildExamSchedule(String classId, String startsOn, String roomLabel) {
        List<ClassSubjectTeacher> allocated = subjectTeachers.findByClassIdOrderByIdAsc(classId);
        List<String> names = allocated.stream().map(ClassSubjectTeacher::getSubject).distinct().toList();
        if (names.isEmpty()) return List.of();
        LocalDate d = LocalDate.parse(startsOn);
        List<ExamSubject> list = new ArrayList<>();
        for (String name : names) {
            while (d.getDayOfWeek() == DayOfWeek.SUNDAY) d = d.plusDays(1);
            String day = d.getDayOfWeek().getDisplayName(java.time.format.TextStyle.SHORT, Locale.ENGLISH);
            list.add(new ExamSubject(name, d.toString(), day, "09:30 AM – 12:30 PM", "Room " + roomLabel));
            d = d.plusDays(1);
        }
        return list;
    }

    private static List<Integer> grades(ExamWindow e) {
        return Arrays.stream(e.getGradesCsv().split(",")).map(String::trim).map(Integer::parseInt).toList();
    }

    /** Indian grouping, e.g. ₹1,23,500 (matches the frontend's formatINR). */
    public static String inr(long v) {
        String s = Long.toString(v);
        if (s.length() <= 3) return "₹" + s;
        String last3 = s.substring(s.length() - 3);
        String rest = s.substring(0, s.length() - 3);
        StringBuilder sb = new StringBuilder();
        for (int i = rest.length(); i > 0; i -= 2) sb.insert(0, (i - 2 > 0 ? "," : "") + rest.substring(Math.max(0, i - 2), i));
        return "₹" + sb + "," + last3;
    }
}
