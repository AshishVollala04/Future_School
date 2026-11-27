package com.futureschool.backend.init;

import com.futureschool.backend.parent.ParentDataService;

import java.time.DayOfWeek;
import java.time.LocalDate;

/** Relative demo dates that never land on a Sunday (exam dates on a Sunday are rejected by validation). */
public final class DemoDates {

    private DemoDates() {
    }

    /** Today (school time zone) plus {@code days}, moved to Monday if that day is a Sunday. */
    public static LocalDate schoolDayIn(int days) {
        LocalDate d = LocalDate.now(ParentDataService.SCHOOL_ZONE).plusDays(days);
        return d.getDayOfWeek() == DayOfWeek.SUNDAY ? d.plusDays(1) : d;
    }
}
