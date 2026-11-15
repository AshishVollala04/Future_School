package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/**
 * One Microsoft/Google sign-in in progress (OIDC authorization code flow with PKCE). Single use,
 * 10 minutes. The state is what comes back on the redirect; nonce and code_verifier stay here.
 */
@Entity
@Table(name = "idp_login_states")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class IdpLoginState {

    @Id
    @Column(name = "state", length = 64)
    private String state;

    @Column(name = "provider", nullable = false, length = 16)
    private String provider;

    @Column(name = "nonce", nullable = false, length = 64)
    private String nonce;

    @Column(name = "code_verifier", nullable = false, length = 128)
    private String codeVerifier;

    @Column(name = "invite_token", length = 64)
    private String inviteToken;

    @Convert(converter = InstantMillisConverter.class)
    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "used", nullable = false)
    private boolean used;
}
