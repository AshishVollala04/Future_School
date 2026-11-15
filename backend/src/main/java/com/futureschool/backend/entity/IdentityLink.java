package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/**
 * A Principal/Admin account linked to a Microsoft or Google identity. The link is by the
 * provider's permanent subject (Microsoft "tid:oid", Google "sub"), never by the email text,
 * so changing or reusing an email at the provider cannot take over an account.
 */
@Entity
@Table(name = "identity_links", indexes = {
    @Index(name = "uk_identity_link_subject", columnList = "provider, subject", unique = true),
    @Index(name = "idx_identity_link_account", columnList = "account_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class IdentityLink {

    @Id
    @Column(name = "id", length = 64)
    private String id;

    /** MICROSOFT or GOOGLE. */
    @Column(name = "provider", nullable = false, length = 16)
    private String provider;

    @Column(name = "subject", nullable = false, length = 200)
    private String subject;

    @Column(name = "account_id", nullable = false, length = 64)
    private String accountId;

    /** The email the provider reported when the link was made (for display only; never used to match). */
    @Column(name = "email", length = 200)
    private String email;

    @Convert(converter = InstantMillisConverter.class)
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
}
