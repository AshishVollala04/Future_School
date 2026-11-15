package com.futureschool.backend.auth;

import com.futureschool.backend.entity.OtpChallenge;
import com.futureschool.backend.repository.OtpChallengeRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.UUID;

/**
 * OTP rules (same as the frontend prototype):
 *  6 random digits, 5-minute expiry, 5 wrong attempts locks the challenge,
 *  30 s resend cooldown, max 3 resends, max 5 requests per destination per 15 minutes.
 * Only an HMAC of the code is stored. The code is returned to the client ONLY when
 * app.otp.dev-reveal=true (development); never in production.
 */
@Service
public class OtpService {

    static final Duration TTL = Duration.ofMinutes(5);
    static final int MAX_ATTEMPTS = 5;
    static final Duration RESEND_COOLDOWN = Duration.ofSeconds(30);
    static final int MAX_RESENDS = 3;
    static final Duration RATE_WINDOW = Duration.ofMinutes(15);
    static final int DEFAULT_RATE_MAX = 5;

    private final OtpChallengeRepository challenges;
    private final OtpSender sender;
    private final SecureRandom random = new SecureRandom();
    private final byte[] pepper;
    private final boolean devReveal;
    private final int rateMax;

    public OtpService(OtpChallengeRepository challenges, OtpSender sender,
                      @Value("${app.otp.pepper:${jwt.secret}}") String pepper,
                      @Value("${app.otp.dev-reveal:false}") boolean devReveal,
                      @Value("${app.otp.rate-max:5}") int rateMax) {
        this.rateMax = rateMax;
        this.challenges = challenges;
        this.sender = sender;
        this.pepper = pepper.getBytes(StandardCharsets.UTF_8);
        this.devReveal = devReveal;
    }

    public record ChallengeView(String challengeId, String channel, String maskedDestination, long expiresAt,
                                long resendAvailableAt, int attemptsRemaining, String devCode) {
    }

    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.REQUIRES_NEW)
    public ChallengeView issue(String channel, String destination, String purpose, String boundTo) {
        Instant now = Instant.now();
        if (challenges.countByDestinationAndCreatedAtAfter(destination, now.minus(RATE_WINDOW)) >= rateMax) {
            throw new AuthFlowException("RATE_LIMITED", "Too many codes requested. Please wait 15 minutes and try again.", null, 429);
        }
        String code = newCode();
        OtpChallenge c = challenges.save(OtpChallenge.builder()
                .id("OTP-" + UUID.randomUUID())
                .channel(channel).destination(destination).purpose(purpose).boundTo(boundTo)
                .codeHash(hash(code)).attemptsLeft(MAX_ATTEMPTS).resends(0)
                .createdAt(now).lastSentAt(now).expiresAt(now.plus(TTL)).consumed(false)
                .build());
        deliver(channel, destination, code, purpose);
        return view(c, code);
    }

    @Transactional
    public ChallengeView resend(String challengeId) {
        OtpChallenge c = challenges.findById(challengeId).orElseThrow(() -> new AuthFlowException("NOT_FOUND", "This code is no longer valid. Start again."));
        Instant now = Instant.now();
        if (c.isConsumed() || c.getAttemptsLeft() <= 0) throw new AuthFlowException("NOT_FOUND", "This code is no longer valid. Start again.");
        if (c.getResends() >= MAX_RESENDS) throw new AuthFlowException("RESEND_LIMIT", "No more resends. Start again.", null, 429);
        if (now.isBefore(c.getLastSentAt().plus(RESEND_COOLDOWN))) throw new AuthFlowException("COOLDOWN", "Please wait before asking for a new code.", null, 429);
        String code = newCode();
        c.setCodeHash(hash(code));
        c.setResends(c.getResends() + 1);
        c.setLastSentAt(now);
        c.setExpiresAt(now.plus(TTL));
        challenges.save(c);
        deliver(c.getChannel(), c.getDestination(), code, c.getPurpose());
        return view(c, code);
    }

    /** Checks and consumes the code. Returns the verified challenge (destination is trustworthy). */
    // Own transaction: a wrong attempt must be counted even though the caller's transaction rolls back.
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.REQUIRES_NEW, noRollbackFor = AuthFlowException.class)
    public OtpChallenge verify(String challengeId, String code, String purpose, String boundTo) {
        OtpChallenge c = challenges.findById(challengeId).orElseThrow(() -> new AuthFlowException("NOT_FOUND", "This code is no longer valid. Start again."));
        if (!c.getPurpose().equals(purpose) || (boundTo != null && !boundTo.equals(c.getBoundTo()))) {
            throw new AuthFlowException("NOT_FOUND", "This code is no longer valid. Start again.");
        }
        if (c.isConsumed()) throw new AuthFlowException("NOT_FOUND", "This code was already used. Start again.");
        if (Instant.now().isAfter(c.getExpiresAt())) throw new AuthFlowException("EXPIRED", "This code has expired. Ask for a new one.");
        if (c.getAttemptsLeft() <= 0) throw new AuthFlowException("LOCKED", "Too many wrong attempts. Start again.", 0, 401);
        boolean match = code != null && MessageDigest.isEqual(hash(code.trim()).getBytes(StandardCharsets.UTF_8), c.getCodeHash().getBytes(StandardCharsets.UTF_8));
        if (!match) {
            c.setAttemptsLeft(c.getAttemptsLeft() - 1);
            challenges.save(c);
            if (c.getAttemptsLeft() <= 0) throw new AuthFlowException("LOCKED", "Too many wrong attempts. Start again.", 0, 401);
            throw new AuthFlowException("WRONG_CODE", "That code is not correct.", c.getAttemptsLeft(), 401);
        }
        c.setConsumed(true);
        challenges.save(c);
        return c;
    }

    /** A failed delivery rolls the challenge back (this method runs in issue/resend's transaction). */
    private void deliver(String channel, String destination, String code, String purpose) {
        try {
            sender.send(channel, destination, code, purpose);
        } catch (RuntimeException e) {
            throw new AuthFlowException("DELIVERY_FAILED", "We could not send the code right now. Please try again in a minute.", null, 503);
        }
    }

    private ChallengeView view(OtpChallenge c, String code) {
        long resendAt = c.getResends() >= MAX_RESENDS ? Long.MAX_VALUE : c.getLastSentAt().plus(RESEND_COOLDOWN).toEpochMilli();
        return new ChallengeView(c.getId(), c.getChannel(), mask(c.getChannel(), c.getDestination()), c.getExpiresAt().toEpochMilli(),
                resendAt, c.getAttemptsLeft(), devReveal ? code : null);
    }

    private String newCode() {
        return String.format("%06d", random.nextInt(1_000_000));
    }

    private String hash(String code) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(pepper, "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(code.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("OTP hashing unavailable", e);
        }
    }

    public static String mask(String channel, String destination) {
        if ("SMS".equals(channel)) {
            return destination.length() >= 4 ? "+91 ••••••" + destination.substring(destination.length() - 4) : "••••";
        }
        int at = destination.indexOf('@');
        if (at <= 2) return "••@" + destination.substring(Math.max(at + 1, 0));
        return destination.substring(0, 2) + "•••••••" + destination.substring(at);
    }
}
