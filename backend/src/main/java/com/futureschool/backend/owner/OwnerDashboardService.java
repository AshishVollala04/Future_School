package com.futureschool.backend.owner;

import com.futureschool.backend.entity.*;
import com.futureschool.backend.parent.ParentDataService;
import com.futureschool.backend.parent.ParentViews.FeeSummary;
import com.futureschool.backend.repository.*;
import com.futureschool.backend.security.SchoolPrincipal;
import com.futureschool.backend.teaching.Teaching;
import com.futureschool.backend.tenant.TenantContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Owner's dashboard: today's money and attendance for every branch the person manages.
 *
 *  - Who: the Principal, or an Admin with FINANCE or REPORTS, of the current school. The other
 *    branches shown are the schools where the SAME account holds such a role; each is read in
 *    its own school context, so nothing crosses into a school the person does not manage.
 *  - Every number is counted from recorded data (payments, fee charges, attendance registers).
 *    Simulated (test) payments are counted separately and never mixed into real money.
 */
@Service
public class OwnerDashboardService {

    private final SchoolMembershipRepository memberships;
    private final SchoolRepository schools;
    private final FeePaymentRepository payments;
    private final StudentAttendanceDayRepository days;
    private final AttendanceRegisterRepository registers;
    private final SchoolClassRepository classes;
    private final ParentDataService fees;
    private final Teaching t;
    private final TransactionTemplate tx;

    public OwnerDashboardService(SchoolMembershipRepository memberships, SchoolRepository schools, FeePaymentRepository payments,
                                 StudentAttendanceDayRepository days, AttendanceRegisterRepository registers, SchoolClassRepository classes,
                                 ParentDataService fees, Teaching t, PlatformTransactionManager txm) {
        this.memberships = memberships;
        this.schools = schools;
        this.payments = payments;
        this.days = days;
        this.registers = registers;
        this.classes = classes;
        this.fees = fees;
        this.t = t;
        this.tx = new TransactionTemplate(txm);
        this.tx.setReadOnly(true);
    }

    static boolean manages(SchoolMembership m) {
        if (!m.isActive()) return false;
        if (m.getRole() == UserRole.PRINCIPAL) return true;
        if (m.getRole() != UserRole.ADMIN || m.getPermissions() == null) return false;
        Set<String> perms = Arrays.stream(m.getPermissions().split(",")).map(String::trim).collect(Collectors.toSet());
        return perms.contains("FINANCE") || perms.contains("REPORTS");
    }

    public Map<String, Object> overview(SchoolPrincipal p) {
        if (p.membership() == null || !manages(p.membership())) {
            throw Teaching.denied("The overview is for the Principal and for Admins with Finance or Reports.");
        }
        List<SchoolMembership> mine = memberships.findByAccountIdAndActiveTrue(p.account().getId()).stream()
                .filter(OwnerDashboardService::manages)
                .sorted(Comparator.comparing((SchoolMembership m) -> !m.getSchoolId().equals(p.membership().getSchoolId())).thenComparing(SchoolMembership::getSchoolId))
                .toList();
        List<Map<String, Object>> branches = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (SchoolMembership m : mine) {
            if (!seen.add(m.getSchoolId())) continue;
            branches.add(TenantContext.callAs(m.getSchoolId(), () -> tx.execute(s -> branch(m.getSchoolId()))));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("date", ParentDataService.today());
        out.put("branches", branches);
        out.put("totals", totals(branches));
        return out;
    }

    private Map<String, Object> branch(String schoolId) {
        String today = ParentDataService.today();
        String month = today.substring(0, 7);
        Map<String, Object> b = new LinkedHashMap<>();
        b.put("schoolId", schoolId);
        b.put("schoolName", schools.findById(schoolId).map(School::getName).orElse(schoolId));
        b.put("board", schools.findById(schoolId).map(School::getBoard).orElse(null));

        // ---- money received (real vs simulated kept apart)
        long cashToday = 0, onlineToday = 0, simulatedToday = 0, monthTotal = 0;
        int receiptsToday = 0;
        for (FeePayment fp : payments.findAll()) {
            String at = fp.getPaidAt() == null ? "" : fp.getPaidAt();
            long amt = fp.getAmount() == null ? 0 : fp.getAmount();
            boolean simulated = Boolean.TRUE.equals(fp.getMock());
            if (at.startsWith(today)) {
                receiptsToday++;
                if (simulated) simulatedToday += amt;
                else if (fp.getMethod() != null && fp.getMethod().toUpperCase().startsWith("CASH")) cashToday += amt;
                else onlineToday += amt;
            }
            if (at.startsWith(month) && !simulated) monthTotal += amt;
        }
        Map<String, Object> money = new LinkedHashMap<>();
        money.put("cashToday", cashToday);
        money.put("onlineToday", onlineToday);
        money.put("simulatedToday", simulatedToday);
        money.put("receiptsToday", receiptsToday);
        money.put("thisMonth", monthTotal);

        // ---- dues
        List<Student> active = t.students().findAll().stream().filter(s -> "Active".equals(s.getStatus())).toList();
        long outstanding = 0, overdue = 0;
        int familiesOverdue = 0;
        Map<String, long[]> byClass = new TreeMap<>();
        for (Student s : active) {
            FeeSummary f = fees.summaryFor(s);
            outstanding += f.totalOutstanding();
            if (f.overdueAmount() > 0) {
                overdue += f.overdueAmount();
                familiesOverdue++;
                String label = ParentDataService.gradeOf(s) + "-" + s.getSection();
                long[] c = byClass.computeIfAbsent(label, k -> new long[2]);
                c[0] += f.overdueAmount();
                c[1]++;
            }
        }
        money.put("outstanding", outstanding);
        money.put("overdue", overdue);
        money.put("studentsOverdue", familiesOverdue);
        money.put("overdueByClass", byClass.entrySet().stream()
                .sorted((a, z) -> Long.compare(z.getValue()[0], a.getValue()[0])).limit(5)
                .map(e -> Map.of("classLabel", e.getKey(), "amount", e.getValue()[0], "students", e.getValue()[1])).toList());
        b.put("money", money);

        // ---- attendance today (morning register)
        Set<String> activeIds = active.stream().map(Student::getId).collect(Collectors.toSet());
        int present = 0, absent = 0, leave = 0;
        for (StudentAttendanceDay d : days.findByDate(today)) {
            if (!activeIds.contains(d.getStudentId())) continue;
            String m = d.getMorning();
            if ("P".equals(m)) present++;
            else if ("A".equals(m)) absent++;
            else if ("L".equals(m)) leave++;
        }
        Set<String> marked = registers.findByDate(today).stream().filter(r -> "MORNING".equals(r.getSession()))
                .map(AttendanceRegister::getClassId).collect(Collectors.toSet());
        List<SchoolClass> cls = classes.findByActiveTrueOrderByGradeNumberAscSectionAsc().stream()
                .filter(c -> !t.roster(c.getId()).isEmpty()).toList();
        Map<String, Object> att = new LinkedHashMap<>();
        att.put("students", active.size());
        att.put("present", present);
        att.put("absent", absent);
        att.put("onLeave", leave);
        att.put("notMarked", Math.max(0, active.size() - present - absent - leave));
        att.put("classes", cls.size());
        att.put("classesNotMarked", cls.stream().filter(c -> !marked.contains(c.getId()))
                .map(c -> (c.getGradeNumber() == null ? c.getName() : String.valueOf(c.getGradeNumber())) + "-" + c.getSection()).toList());
        b.put("attendance", att);
        return b;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> totals(List<Map<String, Object>> branches) {
        Map<String, Long> sum = new LinkedHashMap<>();
        for (String k : List.of("cashToday", "onlineToday", "simulatedToday", "thisMonth", "outstanding", "overdue", "studentsOverdue")) sum.put(k, 0L);
        long students = 0, present = 0, absent = 0;
        for (Map<String, Object> b : branches) {
            Map<String, Object> m = (Map<String, Object>) b.get("money");
            for (String k : sum.keySet()) sum.merge(k, ((Number) m.get(k)).longValue(), Long::sum);
            Map<String, Object> a = (Map<String, Object>) b.get("attendance");
            students += ((Number) a.get("students")).longValue();
            present += ((Number) a.get("present")).longValue();
            absent += ((Number) a.get("absent")).longValue();
        }
        Map<String, Object> out = new LinkedHashMap<>(sum);
        out.put("students", students);
        out.put("present", present);
        out.put("absent", absent);
        return out;
    }
}
