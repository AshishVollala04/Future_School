package com.futureschool.backend.roster;

import com.futureschool.backend.entity.AcademicYear;
import com.futureschool.backend.entity.FeeCharge;
import com.futureschool.backend.entity.FeeInstalment;
import com.futureschool.backend.repository.AcademicYearRepository;
import com.futureschool.backend.repository.FeeChargeRepository;
import com.futureschool.backend.repository.FeeInstalmentRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Academic years of the CURRENT school (every repository read is school-filtered by @TenantId).
 *
 * Fee schedules and charges belong to a year. Rows from before the V13 migration have no year;
 * they are read as the current year and are stamped with it as soon as the current year is recorded,
 * so starting a new year can never re-label last year's dues as this year's.
 */
@Service
public class AcademicYearService {

    private static final ZoneId SCHOOL_ZONE = ZoneId.of("Asia/Kolkata");
    /** "2027-28" or "2027-2028". */
    private static final Pattern NAME = Pattern.compile("^(20\\d{2})-(\\d{2}|20\\d{2})$");

    private final AcademicYearRepository years;
    private final FeeInstalmentRepository instalments;
    private final FeeChargeRepository charges;

    public AcademicYearService(AcademicYearRepository years, FeeInstalmentRepository instalments, FeeChargeRepository charges) {
        this.years = years;
        this.instalments = instalments;
        this.charges = charges;
    }

    public Optional<AcademicYear> current() {
        return years.findByIsCurrentTrue();
    }

    /** The current year's id, or null when the school has not recorded one yet. */
    public String currentYearId() {
        return current().map(AcademicYear::getId).orElse(null);
    }

    public List<AcademicYear> all() {
        return years.findAll().stream().sorted(Comparator.comparing(AcademicYear::getStartDate)).toList();
    }

    public Optional<AcademicYear> byId(String id) {
        return id == null ? Optional.empty() : years.findById(id);
    }

    /** The year whose dates contain the given ISO date (e.g. an exam's start date). */
    public Optional<AcademicYear> yearOn(String isoDate) {
        if (isoDate == null || isoDate.length() < 10) return Optional.empty();
        LocalDate d = LocalDate.parse(isoDate.substring(0, 10));
        return years.findAll().stream().filter(y -> !d.isBefore(y.getStartDate()) && !d.isAfter(y.getEndDate())).findFirst();
    }

    /**
     * The current year, recorded if the school has none yet. A school without a row is running the
     * year the calendar is in (Indian school year: June to April), the same year the app already shows.
     * Then every year-less fee row is stamped with it (idempotent).
     */
    @Transactional
    public AcademicYear ensureCurrent() {
        AcademicYear ay = current().orElseGet(() -> {
            LocalDate today = LocalDate.now(SCHOOL_ZONE);
            int startYear = today.getMonthValue() >= 6 ? today.getYear() : today.getYear() - 1;
            String name = label(startYear);
            return years.findById(idFor(name)).map(existing -> {
                existing.setCurrent(true);
                return years.save(existing);
            }).orElseGet(() -> years.save(AcademicYear.builder().id(idFor(name)).name(name)
                    .startDate(LocalDate.of(startYear, 6, 1)).endDate(LocalDate.of(startYear + 1, 4, 30)).isCurrent(true).build()));
        });
        stampLegacyRows(ay.getId());
        return ay;
    }

    /** Year-less rows (pre-V13) belong to the given year. */
    @Transactional
    public void stampLegacyRows(String yearId) {
        List<FeeInstalment> ins = instalments.findByAcademicYearIdIsNull();
        ins.forEach(i -> i.setAcademicYearId(yearId));
        if (!ins.isEmpty()) instalments.saveAll(ins);
        List<FeeCharge> cs = charges.findByAcademicYearIdIsNull();
        cs.forEach(c -> c.setAcademicYearId(yearId));
        if (!cs.isEmpty()) charges.saveAll(cs);
    }

    /** True when the row's year is the given year; year-less rows count as the current year. */
    public static boolean sameYear(String rowYearId, String yearId, String currentYearId) {
        String effective = rowYearId != null ? rowYearId : currentYearId;
        return effective == null ? yearId == null : effective.equals(yearId);
    }

    // ------------------------------------------------------------------ names

    /** "2027-28" for a year starting in 2027. */
    public static String label(int startYear) {
        return startYear + "-" + String.format("%02d", (startYear + 1) % 100);
    }

    /** Academic-year ids are primary keys shared by all schools, so they carry the school: "AY-GVS-2027-28". */
    public static String idFor(String name) {
        return "AY-" + com.futureschool.backend.tenant.TenantContext.require() + "-" + name;
    }

    /** Parses "2027-28" / "2027-2028" into the start year, or -1 when it is not a valid consecutive pair. */
    public static int startYearOf(String name) {
        if (name == null) return -1;
        Matcher m = NAME.matcher(name.trim());
        if (!m.matches()) return -1;
        int start = Integer.parseInt(m.group(1));
        String end = m.group(2);
        int endFull = end.length() == 2 ? (start / 100) * 100 + Integer.parseInt(end) : Integer.parseInt(end);
        if (end.length() == 2 && endFull < start) endFull += 100;
        return endFull == start + 1 ? start : -1;
    }
}
