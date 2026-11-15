package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/**
 * One OTP sent to a mobile number or email. Only an HMAC of the code is stored.
 * Global table (sign-in happens before a school is chosen).
 */
@Entity
@Table(name = "otp_challenges", indexes = {
    @Index(name = "idx_otp_destination_created", columnList = "destination, created_at")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OtpChallenge {

    @Id
    @Column(name = "id", length = 64)
    private String id;

    /** SMS or EMAIL */
    @Column(name = "channel", nullable = false, length = 8)
    private String channel;

    /** Normalised 10-digit mobile or lower-case email. */
    @Column(name = "destination", nullable = false, length = 160)
    private String destination;

    /** PARENT_LOGIN, TEACHER_LOGIN, STAFF_SECOND_FACTOR, STEP_UP_* */
    @Column(name = "purpose", nullable = false, length = 40)
    private String purpose;

    @Column(name = "code_hash", nullable = false, length = 128)
    private String codeHash;

    /** Binds a staff second factor / step-up to the ticket or session that asked for it. */
    @Column(name = "bound_to", length = 64)
    private String boundTo;

    @Column(name = "attempts_left", nullable = false)
    private int attemptsLeft;

    @Column(name = "resends", nullable = false)
    private int resends;

    @Convert(converter = InstantMillisConverter.class)
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Convert(converter = InstantMillisConverter.class)
    @Column(name = "last_sent_at", nullable = false)
    private Instant lastSentAt;

    @Convert(converter = InstantMillisConverter.class)
    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "consumed", nullable = false)
    private boolean consumed;
}
