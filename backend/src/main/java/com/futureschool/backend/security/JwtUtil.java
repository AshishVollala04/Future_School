package com.futureschool.backend.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.Map;

/**
 * Token type:
 *  - "access": bound to one server-side session = one account, one membership (school + role)
 *    and, for parents, one student. Sign-in steps use single-use server-side tickets instead.
 * The school in an access token is the only source of the request's school.
 */
@Component
public class JwtUtil {

    public static final String TYPE_ACCESS = "access";
    private static final long SELECT_TTL_MS = 5 * 60 * 1000;

    @Value("${jwt.secret}")
    private String secret;

    private SecretKey getSigningKey() {
        return Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    /** Access token for one server-side session (ses). stu is set for parent sessions only. */
    public String generateAccessToken(String loginId, String accountId, String membershipId, String schoolId, String role, String name,
                                      String sessionId, String studentId, java.time.Instant expiresAt) {
        Map<String, Object> claims = new java.util.HashMap<>(Map.of(
                "typ", TYPE_ACCESS, "aid", accountId, "mid", membershipId, "sid", schoolId, "role", role, "name", name, "ses", sessionId));
        if (studentId != null) claims.put("stu", studentId);
        return build(loginId, claims, Math.max(1000, expiresAt.toEpochMilli() - System.currentTimeMillis()));
    }

    private String build(String subject, Map<String, Object> claims, long ttl) {
        Date now = new Date();
        return Jwts.builder()
                .claims(claims)
                .subject(subject)
                .issuedAt(now)
                .expiration(new Date(now.getTime() + ttl))
                .signWith(getSigningKey())
                .compact();
    }

    /** Verifies signature and expiry; throws on anything invalid. */
    public Claims parse(String token) {
        return Jwts.parser().verifyWith(getSigningKey()).build().parseSignedClaims(token).getPayload();
    }

    /** Parses and checks the token type; throws if it is not of the expected type. */
    public Claims parse(String token, String expectedType) {
        Claims c = parse(token);
        if (!expectedType.equals(c.get("typ", String.class))) {
            throw new io.jsonwebtoken.JwtException("Wrong token type");
        }
        return c;
    }
}
