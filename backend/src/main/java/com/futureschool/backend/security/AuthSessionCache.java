package com.futureschool.backend.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Short-lived in-memory cache of authenticated request principals keyed by session ID.
 * Eliminates 4 serial PostgreSQL round-trips per HTTP request (sessions -> user_accounts ->
 * school_memberships -> schools) while staying bounded by TTL (0 ms disables caching in tests)
 * and explicitly evicted on sign-out, child switch, PIN changes, status changes, or school edits.
 */
@Component
public class AuthSessionCache {

    public record Entry(SchoolPrincipal principal, boolean schoolActive, long cachedAtMs) {
    }

    private final long ttlMs;
    private final Map<String, Entry> entries = new ConcurrentHashMap<>();

    public AuthSessionCache(@Value("${app.auth.session-cache-ms:20000}") long ttlMs) {
        this.ttlMs = Math.max(0L, ttlMs);
    }

    public Entry getValid(String sessionId, String accountId, String membershipId, String schoolId) {
        if (ttlMs <= 0 || sessionId == null) return null;
        Entry e = entries.get(sessionId);
        if (e == null) return null;
        long nowMs = System.currentTimeMillis();
        if (nowMs - e.cachedAtMs() >= ttlMs) {
            entries.remove(sessionId, e);
            return null;
        }
        SchoolPrincipal p = e.principal();
        if (!e.schoolActive()
                || p.session().isRevoked()
                || !p.session().getExpiresAt().isAfter(Instant.now())
                || !p.account().isActive()
                || !p.membership().isActive()
                || !p.account().getId().equals(accountId)
                || !p.membership().getId().equals(membershipId)
                || !p.schoolId().equals(schoolId)) {
            entries.remove(sessionId, e);
            return null;
        }
        return e;
    }

    public void put(String sessionId, SchoolPrincipal principal, boolean schoolActive) {
        if (ttlMs <= 0 || sessionId == null || principal == null) return;
        entries.put(sessionId, new Entry(principal, schoolActive, System.currentTimeMillis()));
    }

    public void evictSession(String sessionId) {
        if (sessionId != null) entries.remove(sessionId);
    }

    public void evictAccount(String accountId) {
        if (accountId == null) return;
        entries.entrySet().removeIf(it -> accountId.equals(it.getValue().principal().account().getId()));
    }

    public void evictMembership(String membershipId) {
        if (membershipId == null) return;
        entries.entrySet().removeIf(it -> membershipId.equals(it.getValue().principal().membership().getId()));
    }

    public void evictSchool(String schoolId) {
        if (schoolId == null) return;
        entries.entrySet().removeIf(it -> schoolId.equals(it.getValue().principal().schoolId()));
    }

    public void clear() {
        entries.clear();
    }
}
