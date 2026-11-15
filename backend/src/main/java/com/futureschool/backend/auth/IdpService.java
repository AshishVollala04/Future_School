package com.futureschool.backend.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.futureschool.backend.auth.AuthViews.StaffFirstFactor;
import com.futureschool.backend.entity.IdentityLink;
import com.futureschool.backend.entity.IdpLoginState;
import com.futureschool.backend.entity.StaffInvitation;
import com.futureschool.backend.entity.UserAccount;
import com.futureschool.backend.repository.IdentityLinkRepository;
import com.futureschool.backend.repository.IdpLoginStateRepository;
import com.futureschool.backend.repository.UserAccountRepository;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.LocatorAdapter;
import io.jsonwebtoken.ProtectedHeader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigInteger;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.spec.RSAPublicKeySpec;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * Microsoft and Google sign-in for Principal and Admin (OpenID Connect, authorization code flow
 * with PKCE, done on the server).
 * <ol>
 *   <li>{@link #start}: the app asks for the provider's sign-in page; the server keeps the state,
 *       nonce and PKCE verifier (single use, 10 minutes) and returns the URL to open.</li>
 *   <li>The provider sends the browser back to {@code app.idp.redirect-uri} with a code.</li>
 *   <li>{@link #complete}: the server swaps the code for an ID token (client secret + verifier),
 *       checks its signature against the provider's published keys, issuer, audience, expiry and
 *       nonce, then finds the account.</li>
 * </ol>
 * The account is found by the provider's permanent subject (Microsoft "tid:oid", Google "sub"),
 * never by the email text. A new link is made only after the email code to the school mailbox
 * (the second factor that always follows), either through an Admin invitation or for an existing
 * Principal/Admin whose school email matches. A provider without a client id is switched off.
 */
@Service
public class IdpService {

    private static final Logger log = LoggerFactory.getLogger(IdpService.class);
    private static final Duration STATE_TTL = Duration.ofMinutes(10);
    private static final long CLOCK_SKEW_SECS = 60;

    /** One configured provider. A null issuer means Microsoft multi-tenant: checked against the token's tid. */
    record Provider(String key, String clientId, String clientSecret, String authorizeUrl, String tokenUrl, String jwksUrl,
                    String issuer, String microsoftAuthority) {
    }

    private final Map<String, Provider> providers = new LinkedHashMap<>();
    private final String redirectUri;
    private final IdpLoginStateRepository states;
    private final IdentityLinkRepository links;
    private final UserAccountRepository accounts;
    private final SignInService signIn;
    private final ObjectMapper json = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final SecureRandom random = new SecureRandom();
    /** Provider key -> (kid -> public key), refreshed when an unknown kid appears. */
    private final Map<String, Map<String, Key>> keyCache = new ConcurrentHashMap<>();

    public IdpService(Environment env, IdpLoginStateRepository states, IdentityLinkRepository links, UserAccountRepository accounts,
                      SignInService signIn) {
        this.states = states;
        this.links = links;
        this.accounts = accounts;
        this.signIn = signIn;
        this.redirectUri = env.getProperty("app.idp.redirect-uri", "http://localhost:3000/login/idp-callback");

        String msClient = env.getProperty("app.idp.microsoft.client-id", "");
        if (!msClient.isBlank()) {
            String authority = env.getProperty("app.idp.microsoft.authority", "https://login.microsoftonline.com");
            String tenant = env.getProperty("app.idp.microsoft.tenant", "organizations");
            providers.put("MICROSOFT", new Provider("MICROSOFT", msClient, env.getProperty("app.idp.microsoft.client-secret", ""),
                    env.getProperty("app.idp.microsoft.authorize-url", authority + "/" + tenant + "/oauth2/v2.0/authorize"),
                    env.getProperty("app.idp.microsoft.token-url", authority + "/" + tenant + "/oauth2/v2.0/token"),
                    env.getProperty("app.idp.microsoft.jwks-url", authority + "/" + tenant + "/discovery/v2.0/keys"),
                    // A single-tenant setup pins the issuer; "organizations"/"common" checks it against the token's tid.
                    env.getProperty("app.idp.microsoft.issuer", isMultiTenant(tenant) ? null : authority + "/" + tenant + "/v2.0"),
                    authority));
        }
        String gClient = env.getProperty("app.idp.google.client-id", "");
        if (!gClient.isBlank()) {
            providers.put("GOOGLE", new Provider("GOOGLE", gClient, env.getProperty("app.idp.google.client-secret", ""),
                    env.getProperty("app.idp.google.authorize-url", "https://accounts.google.com/o/oauth2/v2/auth"),
                    env.getProperty("app.idp.google.token-url", "https://oauth2.googleapis.com/token"),
                    env.getProperty("app.idp.google.jwks-url", "https://www.googleapis.com/oauth2/v3/certs"),
                    env.getProperty("app.idp.google.issuer", "https://accounts.google.com"),
                    null));
        }
    }

    private static boolean isMultiTenant(String tenant) {
        return tenant.equals("organizations") || tenant.equals("common");
    }

    /** Providers with keys configured. The app shows only these buttons. */
    public List<String> enabledProviders() {
        return List.copyOf(providers.keySet());
    }

    private Provider provider(String key) {
        Provider p = key == null ? null : providers.get(key.toUpperCase());
        if (p == null) throw new AuthFlowException("IDP_NOT_CONFIGURED", "This sign-in option is not set up for your school yet. Use your password.", null, 400);
        return p;
    }

    private String random(int bytes) {
        byte[] b = new byte[bytes];
        random.nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }

    private static String enc(String v) {
        return URLEncoder.encode(v, StandardCharsets.UTF_8);
    }

    /** Step 1: returns {authorizeUrl}. The email is only a login hint; it decides nothing. */
    @Transactional
    public Map<String, Object> start(String providerKey, String emailHint, String inviteToken) {
        Provider p = provider(providerKey);
        String state = random(24), nonce = random(24), verifier = random(48);
        String challenge;
        try {
            challenge = Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        states.save(IdpLoginState.builder().state(state).provider(p.key()).nonce(nonce).codeVerifier(verifier)
                .inviteToken(inviteToken == null || inviteToken.isBlank() ? null : inviteToken)
                .expiresAt(Instant.now().plus(STATE_TTL)).used(false).build());
        StringBuilder url = new StringBuilder(p.authorizeUrl())
                .append(p.authorizeUrl().contains("?") ? "&" : "?")
                .append("client_id=").append(enc(p.clientId()))
                .append("&response_type=code")
                .append("&redirect_uri=").append(enc(redirectUri))
                .append("&scope=").append(enc("openid email profile"))
                .append("&state=").append(enc(state))
                .append("&nonce=").append(enc(nonce))
                .append("&code_challenge=").append(enc(challenge))
                .append("&code_challenge_method=S256")
                .append("&prompt=select_account");
        if (emailHint != null && !emailHint.isBlank()) url.append("&login_hint=").append(enc(emailHint.trim()));
        return Map.of("authorizeUrl", url.toString(), "provider", p.key());
    }

    private static AuthFlowException failed() {
        return new AuthFlowException("IDP_FAILED", "Microsoft/Google sign-in did not complete. Please try again, or use your password.", null, 401);
    }

    /** Step 3: after the provider redirected back with a code. Returns the email-code step (staff/verify). */
    @Transactional(noRollbackFor = AuthFlowException.class)
    public StaffFirstFactor complete(String state, String code) {
        IdpLoginState s = state == null ? null : states.findById(state).orElse(null);
        if (s == null || s.isUsed() || Instant.now().isAfter(s.getExpiresAt())) throw failed();
        s.setUsed(true);
        states.save(s);
        if (code == null || code.isBlank()) throw failed();
        Provider p = provider(s.getProvider());

        Claims c = verifiedIdToken(p, exchange(p, code, s.getCodeVerifier()), s.getNonce());
        String subject, email;
        if (p.key().equals("MICROSOFT")) {
            String tid = c.get("tid", String.class), oid = c.get("oid", String.class);
            if (tid == null || oid == null) throw failed();
            subject = tid + ":" + oid;
            email = Optional.ofNullable(c.get("email", String.class)).orElse(c.get("preferred_username", String.class));
        } else {
            subject = c.getSubject();
            Boolean verified = c.get("email_verified", Boolean.class);
            // An unverified Google email cannot be used to find or link an account.
            email = Boolean.TRUE.equals(verified) ? c.get("email", String.class) : null;
        }
        if (subject == null || subject.isBlank()) throw failed();
        String cleanEmail = email == null ? null : email.trim().toLowerCase();

        // 1. Already linked: the subject decides, never the email.
        IdentityLink link = links.findByProviderAndSubject(p.key(), subject).orElse(null);
        if (link != null) {
            UserAccount a = accounts.findById(link.getAccountId()).orElse(null);
            if (!signIn.isActiveLeadership(a)) throw notLinked(p);
            return signIn.idpFirstFactor(a, p.key(), null, null, null, a.getEmail());
        }
        // 2. An Admin invitation for this email: link after the email code to the invited mailbox.
        if (s.getInviteToken() != null && cleanEmail != null) {
            StaffInvitation i = signIn.invitationFor(s.getInviteToken(), cleanEmail);
            UserAccount invited = i == null ? null : accounts.findById(i.getAccountId()).orElse(null);
            if (invited != null) return signIn.idpFirstFactor(invited, p.key(), i.getToken(), subject, cleanEmail, i.getEmail());
        }
        // 3. An existing Principal/Admin with this school email: link after the email code to that mailbox.
        if (cleanEmail != null) {
            UserAccount a = accounts.findByEmailIgnoreCase(cleanEmail).orElse(null);
            if (signIn.isActiveLeadership(a)) return signIn.idpFirstFactor(a, p.key(), null, subject, cleanEmail, a.getEmail());
        }
        throw notLinked(p);
    }

    private static AuthFlowException notLinked(Provider p) {
        String label = p.key().equals("MICROSOFT") ? "Microsoft" : "Google";
        return new AuthFlowException("IDP_NOT_LINKED", "This " + label + " account is not linked to FutureSchool. Use your password, or ask your school Admin for an invitation.", null, 403);
    }

    /** Swap the code for an ID token. Client secret and PKCE verifier stay on the server. */
    private String exchange(Provider p, String code, String verifier) {
        String form = "grant_type=authorization_code"
                + "&code=" + enc(code)
                + "&redirect_uri=" + enc(redirectUri)
                + "&client_id=" + enc(p.clientId())
                + "&client_secret=" + enc(p.clientSecret())
                + "&code_verifier=" + enc(verifier);
        try {
            HttpResponse<String> r = http.send(HttpRequest.newBuilder(URI.create(p.tokenUrl())).timeout(Duration.ofSeconds(15))
                    .header("Content-Type", "application/x-www-form-urlencoded").POST(HttpRequest.BodyPublishers.ofString(form)).build(),
                    HttpResponse.BodyHandlers.ofString());
            if (r.statusCode() / 100 != 2) {
                log.warn("{} token endpoint answered {}", p.key(), r.statusCode());
                throw failed();
            }
            JsonNode n = json.readTree(r.body());
            String idToken = n.path("id_token").asText(null);
            if (idToken == null) throw failed();
            return idToken;
        } catch (AuthFlowException e) {
            throw e;
        } catch (Exception e) {
            log.warn("{} token exchange failed: {}", p.key(), e.getClass().getSimpleName());
            throw failed();
        }
    }

    /** Signature (provider's published RSA keys), issuer, audience, expiry and nonce. */
    private Claims verifiedIdToken(Provider p, String idToken, String nonce) {
        Claims c;
        try {
            c = Jwts.parser()
                    .keyLocator(new LocatorAdapter<Key>() {
                        @Override
                        protected Key locate(ProtectedHeader header) {
                            return key(p, header.getKeyId());
                        }
                    })
                    .clockSkewSeconds(CLOCK_SKEW_SECS)
                    .build()
                    .parseSignedClaims(idToken)
                    .getPayload();
        } catch (Exception e) {
            log.warn("{} ID token rejected: {}", p.key(), e.getClass().getSimpleName());
            throw failed();
        }
        Set<String> aud = c.getAudience();
        if (aud == null || !aud.contains(p.clientId())) throw failed();
        if (c.getExpiration() == null) throw failed();
        if (!nonce.equals(c.get("nonce", String.class))) throw failed();
        String expectedIssuer = p.issuer();
        if (expectedIssuer == null) {
            String tid = c.get("tid", String.class);
            if (tid == null) throw failed();
            expectedIssuer = p.microsoftAuthority() + "/" + tid + "/v2.0";
        }
        if (!expectedIssuer.equals(c.getIssuer())) throw failed();
        return c;
    }

    private Key key(Provider p, String kid) {
        Map<String, Key> keys = keyCache.get(p.key());
        if (keys == null || kid == null || !keys.containsKey(kid)) {
            keys = fetchKeys(p);
            keyCache.put(p.key(), keys);
        }
        Key k = kid == null ? null : keys.get(kid);
        if (k == null) throw new IllegalStateException("unknown signing key");
        return k;
    }

    private Map<String, Key> fetchKeys(Provider p) {
        try {
            HttpResponse<String> r = http.send(HttpRequest.newBuilder(URI.create(p.jwksUrl())).timeout(Duration.ofSeconds(10)).GET().build(),
                    HttpResponse.BodyHandlers.ofString());
            JsonNode keys = json.readTree(r.body()).path("keys");
            Map<String, Key> out = new HashMap<>();
            KeyFactory kf = KeyFactory.getInstance("RSA");
            for (JsonNode k : keys) {
                if (!"RSA".equals(k.path("kty").asText())) continue;
                BigInteger n = new BigInteger(1, Base64.getUrlDecoder().decode(k.path("n").asText()));
                BigInteger e = new BigInteger(1, Base64.getUrlDecoder().decode(k.path("e").asText()));
                out.put(k.path("kid").asText(), kf.generatePublic(new RSAPublicKeySpec(n, e)));
            }
            return out;
        } catch (Exception e) {
            log.warn("{} signing keys could not be read: {}", p.key(), e.getClass().getSimpleName());
            return Map.of();
        }
    }

    /** For the production start-up guard. */
    public static List<String> problems(Environment env) {
        boolean any = !env.getProperty("app.idp.microsoft.client-id", "").isBlank() || !env.getProperty("app.idp.google.client-id", "").isBlank();
        if (!any) return List.of();
        String redirect = env.getProperty("app.idp.redirect-uri", "");
        List<String> out = new ArrayList<>();
        if (!redirect.startsWith("https://") || redirect.contains("localhost")) out.add("app.idp.redirect-uri must be the real https app address + /login/idp-callback");
        return out.stream().collect(Collectors.toList());
    }
}
