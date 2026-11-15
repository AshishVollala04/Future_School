package com.futureschool.backend.governance;

import com.futureschool.backend.entity.*;
import com.futureschool.backend.parent.ParentDataService;
import com.futureschool.backend.parent.ParentViews.Allocation;
import com.futureschool.backend.parent.ParentViews.FeeLine;
import com.futureschool.backend.repository.AuditEventRepository;
import com.futureschool.backend.repository.FeePaymentRepository;
import com.futureschool.backend.repository.StudentRepository;
import com.futureschool.backend.security.SchoolPrincipal;
import com.futureschool.backend.teaching.Teaching;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.*;

/**
 * School office fee desk (Admin with FINANCE): look up fee accounts and record CASH received at
 * the counter, allocated oldest-due first. Concessions/refunds are NOT here: they go through
 * governance. Recording a payment never releases a hall ticket. No card/UPI/bank data.
 */
@Service
public class FeeDeskService {

    private static final Set<String> PAYMENT_ALERT_ACTIONS = Set.of(
            "PAYMENT_CAPTURE_UNRECORDED", "PAYMENT_CAPTURED_AFTER_EXPIRY", "PAYMENT_WEBHOOK_ALERT"
    );

    private final StudentRepository students;
    private final FeePaymentRepository payments;
    private final AuditEventRepository audit;
    private final ParentDataService fees;
    private final Teaching t;

    public FeeDeskService(StudentRepository students, FeePaymentRepository payments, AuditEventRepository audit, ParentDataService fees, Teaching t) {
        this.students = students;
        this.payments = payments;
        this.audit = audit;
        this.fees = fees;
        this.t = t;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> paymentAlerts(SchoolPrincipal p) {
        GovernanceService.requirePermission(p, "FINANCE");
        return audit.findByActionInOrderByAtDesc(PAYMENT_ALERT_ACTIONS).stream()
                .limit(50)
                .map(e -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", e.getId());
                    m.put("action", e.getAction());
                    m.put("studentId", e.getTargetId());
                    m.put("details", e.getDetails());
                    m.put("at", e.getAt());
                    return m;
                }).toList();
    }

    private static Map<String, Object> ref(Student s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", s.getId());
        m.put("name", s.getName());
        m.put("grade", ParentDataService.gradeOf(s));
        m.put("section", s.getSection());
        m.put("rollNumber", s.getRoll());
        m.put("admissionNo", s.getAdmissionNumber());
        return m;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> search(SchoolPrincipal p, String query) {
        GovernanceService.requirePermission(p, "FINANCE");
        String q = query == null ? "" : query.trim().toLowerCase();
        String today = ParentDataService.today();
        return students.findAll().stream()
                .filter(s -> q.isEmpty() || s.getName().toLowerCase().contains(q) || s.getAdmissionNumber().toLowerCase().contains(q)
                        || (ParentDataService.gradeOf(s) + "-" + s.getSection()).toLowerCase().equals(q))
                .sorted(Comparator.comparingInt(ParentDataService::gradeOf).reversed().thenComparing(Student::getSection).thenComparing(Student::getRoll))
                .map(s -> {
                    List<FeeLine> lines = fees.feeLines(s.getId(), today);
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("student", ref(s));
                    m.put("outstanding", lines.stream().mapToLong(FeeLine::outstanding).sum());
                    m.put("overdue", lines.stream().filter(FeeLine::overdue).mapToLong(FeeLine::outstanding).sum());
                    return m;
                }).toList();
    }

    private Student student(String id) {
        return students.findById(id == null ? "" : id).orElseThrow(() -> Teaching.denied("Student not found in this school."));
    }

    @Transactional(readOnly = true)
    public Map<String, Object> account(SchoolPrincipal p, String studentId) {
        GovernanceService.requirePermission(p, "FINANCE");
        Student s = student(studentId);
        var pays = fees.paymentsFor(s);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("student", ref(s));
        m.put("summary", fees.summaryFor(s));
        m.put("payments", pays.payments());
        m.put("refunds", pays.refunds());
        return m;
    }

    @Transactional
    public Object recordCash(SchoolPrincipal p, String studentId, long amount, String note) {
        GovernanceService.requirePermission(p, "FINANCE");
        Student s = student(studentId);
        if (amount <= 0) throw Teaching.rule("BAD_AMOUNT", "Enter the amount received.");
        List<FeeLine> lines = fees.feeLines(s.getId(), ParentDataService.today());
        long outstanding = lines.stream().mapToLong(FeeLine::outstanding).sum();
        if (outstanding <= 0) throw Teaching.rule("NOTHING_DUE", "Nothing is outstanding for this student.");
        if (amount > outstanding) throw Teaching.rule("BAD_AMOUNT", "Amount is more than the outstanding balance. Do not collect extra.");
        List<Allocation> alloc = ParentDataService.allocate(lines, amount);
        String school = t.school();
        String n = note == null ? "" : note.trim();
        FeePayment pay = payments.save(FeePayment.builder().id("PAY-" + school + "-" + UUID.randomUUID().toString().substring(0, 8))
                .studentId(s.getId()).amount(amount).method("CASH_AT_OFFICE").providerRef("office-cash" + (n.isEmpty() ? "" : " · " + (n.length() > 80 ? n.substring(0, 80) : n)))
                .paidAt(OffsetDateTime.now(ParentDataService.SCHOOL_ZONE).toString()).recordedByStaffId(p.account().getId())
                .receiptNo(fees.nextReceiptNo(school)).mock(false)
                .allocations(new ArrayList<>(alloc.stream().map(a -> new PaymentAllocation(a.chargeId(), a.amount())).toList())).build());
        t.record(p, "FEE_CASH_RECORDED", s.getId(), "Cash " + ParentDataService.inr(amount) + " recorded at office, receipt " + pay.getReceiptNo() + ".", null);
        return fees.view(pay);
    }
}
