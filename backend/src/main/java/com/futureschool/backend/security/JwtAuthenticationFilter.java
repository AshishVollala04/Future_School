package com.futureschool.backend.security;

import com.futureschool.backend.entity.SchoolMembership;
import com.futureschool.backend.entity.UserAccount;
import com.futureschool.backend.repository.LoginSessionRepository;
import com.futureschool.backend.repository.SchoolMembershipRepository;
import com.futureschool.backend.repository.SchoolRepository;
import com.futureschool.backend.repository.UserAccountRepository;
import com.futureschool.backend.tenant.TenantContext;
import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Authenticates an ACCESS token and puts its school into {@link TenantContext}.
 * The account and membership are re-checked on every request, so suspending a membership
 * takes effect immediately. The school is cleared when the request ends.
 */
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(JwtAuthenticationFilter.class);

    private final JwtUtil jwtUtil;
    private final UserAccountRepository accounts;
    private final SchoolMembershipRepository memberships;
    private final SchoolRepository schools;
    private final LoginSessionRepository sessions;
    private AuthSessionCache sessionCache;

    public JwtAuthenticationFilter(JwtUtil jwtUtil, UserAccountRepository accounts, SchoolMembershipRepository memberships, SchoolRepository schools,
                                   LoginSessionRepository sessions) {
        this.sessions = sessions;
        this.jwtUtil = jwtUtil;
        this.accounts = accounts;
        this.memberships = memberships;
        this.schools = schools;
    }

    @Autowired(required = false)
    public void setSessionCache(AuthSessionCache sessionCache) {
        this.sessionCache = sessionCache;
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response, @NonNull FilterChain chain)
            throws ServletException, IOException {
        try {
            String header = request.getHeader("Authorization");
            if (header != null && header.startsWith("Bearer ") && SecurityContextHolder.getContext().getAuthentication() == null) {
                authenticate(header.substring(7), request);
            }
            if (pinSetupPending(request)) {
                // A teacher must set a sign-in PIN first. Until then only the PIN screen and sign-out work.
                response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                response.setContentType("application/json");
                response.getWriter().write("{\"success\":false,\"code\":\"PIN_SETUP_REQUIRED\",\"error\":\"Set your 4-digit sign-in PIN first.\"}");
                return;
            }
            chain.doFilter(request, response);
        } finally {
            TenantContext.clear();
        }
    }

    /**
     * Teachers and parents must have a sign-in PIN. With none yet, or in a "Forgot PIN" session
     * (PIN_RESET), only their PIN endpoint and /api/auth/** (me, logout, switch child) are open.
     */
    private static boolean pinSetupPending(HttpServletRequest request) {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof SchoolPrincipal p)) return false;
        var role = p.membership().getRole();
        if (role != com.futureschool.backend.entity.UserRole.TEACHER && role != com.futureschool.backend.entity.UserRole.PARENT) return false;
        boolean resetting = p.session().getMethods() != null && java.util.Arrays.asList(p.session().getMethods().split(",")).contains("PIN_RESET");
        // Teachers: PIN on the school membership. Parents: PIN on the account (all their schools).
        String hash = role == com.futureschool.backend.entity.UserRole.TEACHER ? p.membership().getPinHash() : p.account().getPinHash();
        if (hash != null && !resetting) return false;
        String path = request.getRequestURI().substring(request.getContextPath().length());
        return !(path.equals("/api/staff/pin") || path.equals("/api/parent/pin") || path.startsWith("/api/auth/"));
    }

    private void authenticate(String jwt, HttpServletRequest request) {
        try {
            Claims c = jwtUtil.parse(jwt, JwtUtil.TYPE_ACCESS);
            String accountId = c.get("aid", String.class);
            String membershipId = c.get("mid", String.class);
            String schoolId = c.get("sid", String.class);
            String sessionId = c.get("ses", String.class);
            if (accountId == null || membershipId == null || schoolId == null || sessionId == null) return;

            SchoolPrincipal principal = null;
            if (sessionCache != null) {
                AuthSessionCache.Entry cached = sessionCache.getValid(sessionId, accountId, membershipId, schoolId);
                if (cached != null) principal = cached.principal();
            }
            if (principal == null) {
                // Server-side session: logout / suspension end it immediately (and evict from sessionCache).
                com.futureschool.backend.entity.LoginSession session = sessions.findById(sessionId).orElse(null);
                if (session == null || session.isRevoked() || java.time.Instant.now().isAfter(session.getExpiresAt())
                        || !accountId.equals(session.getAccountId()) || !membershipId.equals(session.getMembershipId())) return;

                UserAccount account = accounts.findById(accountId).orElse(null);
                if (account == null || !account.isActive() || "Inactive".equalsIgnoreCase(account.getStatus())) return;
                SchoolMembership m = memberships.findByIdAndAccountId(membershipId, accountId).orElse(null);
                if (m == null || !m.isActive() || !schoolId.equals(m.getSchoolId())) return;
                if (schools.findById(schoolId).map(s -> !"ACTIVE".equals(s.getStatus())).orElse(true)) return;

                principal = new SchoolPrincipal(account, m, session);
                if (sessionCache != null) sessionCache.put(sessionId, principal, true);
            }
            final SchoolPrincipal resolved = principal;
            UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(resolved, null, resolved.authorities()) {
                @Override
                public String getName() {
                    return resolved.loginId();
                }
            };
            auth.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
            SecurityContextHolder.getContext().setAuthentication(auth);
            TenantContext.set(schoolId);
        } catch (Exception e) {
            // Invalid, expired or wrong-type token: continue unauthenticated (secured routes return 401).
            log.debug("Rejected token: {}", e.getMessage());
            SecurityContextHolder.clearContext();
            TenantContext.clear();
        }
    }
}
