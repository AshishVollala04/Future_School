package com.futureschool.backend.alerts;

import com.fasterxml.jackson.core.type.TypeReference;
import com.futureschool.backend.entity.*;
import com.futureschool.backend.governance.GovernanceService;
import com.futureschool.backend.parent.ParentDataService;
import com.futureschool.backend.parent.ParentViews.FeeSummary;
import com.futureschool.backend.repository.*;
import com.futureschool.backend.security.SchoolPrincipal;
import com.futureschool.backend.teaching.Teaching;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * WhatsApp alerts to parents.
 *
 *  - ABSENT: queued when today's register marks a child absent, held for a few minutes so the
 *    Class Teacher can correct a wrong mark (a correction cancels it). One alert per child per day.
 *    Not sent for a child on approved leave.
 *  - FEE_DUE: the office (FINANCE) sends reminders for OVERDUE fees only, at most once a day per child.
 *  - Nothing is sent when the school turned that alert off or the parent opted out; the row is SKIPPED.
 *  - With no provider connected, rows become LOGGED: visible to the office, never delivered.
 */
@Service
public class AlertService {

    public static final String ABSENT = "ABSENT";
    public static final String FEE_DUE = "FEE_DUE";
    private static final DateTimeFormatter SHORT = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH);

    private final ParentAlertRepository alerts;
    private final AlertSettingsRepository settings;
    private final AlertOptOutRepository optOuts;
    private final StudentAttendanceDayRepository days;
    private final StudentLeaveRepository leaves;
    private final SchoolRepository schools;
    private final ParentDataService fees;
    private final AlertSender sender;
    private final Teaching t;
    private final UserAccountRepository accounts;
    private final long holdMillis;

    public AlertService(ParentAlertRepository alerts, AlertSettingsRepository settings, AlertOptOutRepository optOuts,
                        StudentAttendanceDayRepository days, StudentLeaveRepository leaves, SchoolRepository schools,
                        ParentDataService fees, AlertSender sender, Teaching t, UserAccountRepository accounts,
                        @Value("${app.alerts.absence-hold-minutes:10}") long holdMinutes) {
        this.alerts = alerts;
        this.settings = settings;
        this.optOuts = optOuts;
        this.days = days;
        this.leaves = leaves;
        this.schools = schools;
        this.fees = fees;
        this.sender = sender;
        this.t = t;
        this.accounts = accounts;
        this.holdMillis = Math.max(0, holdMinutes) * 60_000L;
    }

    // ================================================================== helpers

    /** 10-digit Indian mobile, or null. */
    static String mobile10(String raw) {
        if (raw == null) return null;
        String d = raw.replaceAll("[^0-9]", "");
        if (d.length() == 12 && d.startsWith("91")) d = d.substring(2);
        if (d.length() == 11 && d.startsWith("0")) d = d.substring(1);
        return d.matches("[6-9][0-9]{9}") ? d : null;
    }

    /** The guardian's sign-in mobile (verified by OTP) first, then the numbers on the student record. */
    String recipient(Student s) {
        String m = s.getParentAccountId() == null ? null
                : accounts.findById(s.getParentAccountId()).map(a -> mobile10(a.getMobile())).orElse(null);
        if (m == null) m = mobile10(s.getParentMobile());
        if (m == null) m = mobile10(s.getFatherMobile());
        if (m == null) m = mobile10(s.getMotherMobile());
        return m;
    }

    private String schoolName() {
        return schools.findById(t.school()).map(School::getName).orElse("Your school");
    }

    public AlertSettings settingsRow() {
        String id = "ALERTS-" + t.school();
        return settings.findById(id).orElseGet(() -> AlertSettings.builder().id(id).absenceAlerts(true).feeReminders(true).build());
    }

    private String optOutId(String accountId) {
        return "OPT-" + t.school() + "-" + accountId;
    }

    private boolean optedOut(Student s) {
        String acc = s.getParentAccountId();
        return acc != null && (optOuts.existsById(optOutId(acc)) || optOuts.existsById("OPT-" + acc));
    }

    private static String classLabel(Student s) {
        return ParentDataService.gradeOf(s) + "-" + s.getSection();
    }

    private ParentAlert build(String kind, Student s, List<String> params, String preview, String dedupe, String by, long notBefore) {
        String mobile = recipient(s);
        String status = "QUEUED";
        String error = null;
        if (mobile == null) {
            status = "SKIPPED";
            error = "No valid parent mobile on the student record.";
        } else if (optedOut(s)) {
            status = "SKIPPED";
            error = "The parent turned WhatsApp alerts off.";
        }
        return ParentAlert.builder().id("ALR-" + UUID.randomUUID()).kind(kind).studentId(s.getId()).studentName(s.getName())
                .recipientMobile(mobile).channel("WHATSAPP").paramsJson(t.write(params)).preview(preview).status(status).attempts(0)
                .notBefore(notBefore).error(error).dedupeKey(dedupe).createdBy(by).createdAt(Teaching.now()).build();
    }

    // ================================================================== absence

    /**
     * Called by the register after it saved. Queues alerts for children absent today and cancels
     * queued ones for children no longer absent in either session.
     */
    @Transactional
    public void afterRegisterSaved(SchoolPrincipal p, List<Student> roster, String date) {
        if (!ParentDataService.today().equals(date)) return; // only today's register alerts parents
        boolean enabled = settingsRow().isAbsenceAlerts();
        String school = null;
        for (Student s : roster) {
            StudentAttendanceDay day = days.findById(s.getId() + "-" + date).orElse(null);
            boolean absent = day != null && ("A".equals(day.getMorning()) || "A".equals(day.getAfternoon()));
            String key = ABSENT + ":" + s.getId() + ":" + date;
            ParentAlert existing = alerts.findByDedupeKey(key).orElse(null);
            if (!absent) {
                if (existing != null && "QUEUED".equals(existing.getStatus())) {
                    existing.setStatus("CANCELLED");
                    existing.setError("Attendance was corrected before the alert was sent.");
                    alerts.save(existing);
                }
                continue;
            }
            if (!enabled) continue;
            boolean onLeave = leaves.findAll().stream().anyMatch(l -> l.getStudentId().equals(s.getId()) && "APPROVED".equals(l.getStatus())
                    && l.getFromDate().compareTo(date) <= 0 && l.getToDate().compareTo(date) >= 0);
            if (onLeave) continue; // the parent asked for this absence
            if (existing != null) {
                if ("CANCELLED".equals(existing.getStatus())) {
                    existing.setStatus("QUEUED");
                    existing.setError(null);
                    existing.setNotBefore(System.currentTimeMillis() + holdMillis);
                    alerts.save(existing);
                }
                continue;
            }
            if (school == null) school = schoolName();
            String when = LocalDate.parse(date).format(SHORT);
            String preview = school + ": " + s.getName() + " (Class " + classLabel(s) + ") was marked absent today, " + when
                    + ". If this is unexpected, please contact the class teacher.";
            alerts.save(build(ABSENT, s, List.of(s.getName(), when, school), preview, key, p.account().getId(),
                    System.currentTimeMillis() + holdMillis));
        }
    }

    // ================================================================== fee reminders

    public record FeeRun(int queued, int skipped, int alreadyToday, String note) {
    }

    @Transactional
    public FeeRun sendFeeReminders(SchoolPrincipal p) {
        GovernanceService.requirePermission(p, "FINANCE");
        if (!settingsRow().isFeeReminders()) throw Teaching.rule("OFF", "Fee reminders are turned off in alert settings.");
        String today = ParentDataService.today();
        String school = schoolName();
        int queued = 0, skipped = 0, already = 0;
        for (Student s : t.students().findAll()) {
            if (!"Active".equals(s.getStatus())) continue;
            FeeSummary f = fees.summaryFor(s);
            if (f.overdueAmount() <= 0) continue;
            String key = FEE_DUE + ":" + s.getId() + ":" + today;
            if (alerts.existsByDedupeKey(key)) {
                already++;
                continue;
            }
            String amount = ParentDataService.inr(f.overdueAmount());
            String preview = school + ": a school fee of " + amount + " for " + s.getName() + " (Class " + classLabel(s)
                    + ") is overdue. You can pay it in the FutureSchool app with your PIN.";
            ParentAlert a = alerts.save(build(FEE_DUE, s, List.of(s.getName(), amount, school), preview, key, p.account().getId(),
                    System.currentTimeMillis()));
            if ("QUEUED".equals(a.getStatus())) queued++;
            else skipped++;
        }
        t.record(p, "FEE_REMINDERS_SENT", "ALERTS", queued + " queued, " + skipped + " skipped, " + already + " already reminded today.", null);
        return new FeeRun(queued, skipped, already, sender.connected() ? null
                : "WhatsApp is not connected yet, so these reminders are recorded but not delivered.");
    }

    // ================================================================== office views

    public record AlertView(String id, String kind, String studentId, String studentName, String mobile, String preview, String status,
                            String error, String createdAt, String sentAt) {
    }

    public record Overview(String provider, boolean connected, boolean absenceAlerts, boolean feeReminders, long holdMinutes,
                           Map<String, Long> today, List<AlertView> recent) {
    }

    @Transactional(readOnly = true)
    public Overview overview(SchoolPrincipal p) {
        if (!Teaching.isLeadership(p)) throw Teaching.denied("This is a Principal / Admin view.");
        AlertSettings st = settingsRow();
        List<ParentAlert> recent = alerts.findTop200ByOrderByCreatedAtDesc();
        String today = ParentDataService.today();
        Map<String, Long> counts = new TreeMap<>();
        recent.stream().filter(a -> a.getCreatedAt().startsWith(today)).forEach(a -> counts.merge(a.getStatus(), 1L, Long::sum));
        List<AlertView> views = recent.stream().map(a -> new AlertView(a.getId(), a.getKind(), a.getStudentId(), a.getStudentName(),
                AlertSender.Routing.mask(a.getRecipientMobile()), a.getPreview(), a.getStatus(), a.getError(), a.getCreatedAt(), a.getSentAt())).toList();
        return new Overview(sender.provider(), sender.connected(), st.isAbsenceAlerts(), st.isFeeReminders(), holdMillis / 60_000L, counts, views);
    }

    @Transactional
    public Overview updateSettings(SchoolPrincipal p, Boolean absence, Boolean feeReminders) {
        if (p.role() != UserRole.ADMIN) throw Teaching.denied("Only the Admin changes alert settings.");
        AlertSettings st = settingsRow();
        List<String> changes = new ArrayList<>();
        if (absence != null && absence != st.isAbsenceAlerts()) {
            st.setAbsenceAlerts(absence);
            changes.add("absence alerts " + (absence ? "on" : "off"));
        }
        if (feeReminders != null && feeReminders != st.isFeeReminders()) {
            st.setFeeReminders(feeReminders);
            changes.add("fee reminders " + (feeReminders ? "on" : "off"));
        }
        if (!changes.isEmpty()) {
            st.setUpdatedBy(p.account().getId());
            st.setUpdatedAt(Teaching.now());
            settings.save(st);
            t.record(p, "ALERT_SETTINGS_CHANGED", st.getId(), String.join(", ", changes), null);
        }
        return overview(p);
    }

    // ================================================================== parent preference

    public record Preference(boolean whatsappAlerts) {
    }

    private static String parentAccount(SchoolPrincipal p) {
        if (p.role() != UserRole.PARENT) throw Teaching.denied("This is a parent setting.");
        return p.account().getId();
    }

    @Transactional(readOnly = true)
    public Preference preference(SchoolPrincipal p) {
        String acc = parentAccount(p);
        return new Preference(!(optOuts.existsById(optOutId(acc)) || optOuts.existsById("OPT-" + acc)));
    }

    @Transactional
    public Preference setPreference(SchoolPrincipal p, boolean on) {
        String acc = parentAccount(p);
        String scopedId = optOutId(acc);
        String legacyId = "OPT-" + acc;
        if (on) {
            optOuts.findById(scopedId).ifPresent(optOuts::delete);
            optOuts.findById(legacyId).ifPresent(optOuts::delete);
        } else {
            optOuts.findById(legacyId).ifPresent(optOuts::delete);
            if (!optOuts.existsById(scopedId)) {
                optOuts.save(AlertOptOut.builder().id(scopedId).accountId(acc).createdAt(Teaching.now()).build());
            }
        }
        return new Preference(on);
    }

    // ================================================================== dispatch (one school, in its own context)

    @Transactional
    public int dispatchDue() {
        int done = 0;
        for (ParentAlert a : alerts.findTop50ByStatusAndNotBeforeLessThanEqualOrderByNotBeforeAsc("QUEUED", System.currentTimeMillis())) {
            List<String> params = t.read(a.getParamsJson(), new TypeReference<List<String>>() {
            });
            AlertSender.Outcome o = sender.send(a.getKind(), a.getRecipientMobile(), params);
            a.setAttempts(a.getAttempts() + 1);
            if (o.delivered()) {
                a.setStatus("SENT");
                a.setProviderRef(o.ref());
                a.setSentAt(Teaching.now());
                a.setError(null);
            } else if (o.logged()) {
                a.setStatus("LOGGED");
                a.setError("Not delivered: WhatsApp is not connected.");
            } else if (o.retry() && a.getAttempts() < 3) {
                a.setNotBefore(System.currentTimeMillis() + 60_000L * a.getAttempts() * a.getAttempts());
                a.setError(o.error());
            } else {
                a.setStatus("FAILED");
                a.setError(o.error());
            }
            alerts.save(a);
            done++;
        }
        return done;
    }
}
