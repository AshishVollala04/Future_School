package com.futureschool.backend.alerts;

import com.futureschool.backend.entity.School;
import com.futureschool.backend.repository.SchoolRepository;
import com.futureschool.backend.tenant.TenantContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

/** Sends due alerts, one school at a time, each in that school's own context. */
@Configuration
@EnableScheduling
public class AlertDispatcher {
    private static final Logger log = LoggerFactory.getLogger(AlertDispatcher.class);

    private final SchoolRepository schools;
    private final AlertService alerts;
    private final boolean enabled;

    public AlertDispatcher(SchoolRepository schools, AlertService alerts, @Value("${app.alerts.dispatch-enabled:true}") boolean enabled) {
        this.schools = schools;
        this.alerts = alerts;
        this.enabled = enabled;
    }

    @Scheduled(initialDelay = 30_000, fixedDelayString = "${app.alerts.dispatch-every-ms:20000}")
    public void tick() {
        if (enabled) dispatchAll();
    }

    /** Returns how many alerts were processed. */
    public int dispatchAll() {
        int n = 0;
        for (School s : schools.findAll()) {
            if (!"ACTIVE".equals(s.getStatus())) continue;
            try {
                n += TenantContext.callAs(s.getId(), alerts::dispatchDue);
            } catch (RuntimeException e) {
                log.warn("Alert dispatch failed for school {}: {}", s.getId(), e.getMessage());
            }
        }
        return n;
    }
}
