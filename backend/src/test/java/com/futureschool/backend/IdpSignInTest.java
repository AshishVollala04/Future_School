package com.futureschool.backend;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.futureschool.backend.repository.IdentityLinkRepository;
import com.sun.net.httpserver.HttpServer;
import io.jsonwebtoken.Jwts;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.io.OutputStream;
import java.math.BigInteger;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Microsoft/Google sign-in for Principal and Admin against a fake provider (real RS256 ID tokens,
 * a JWKS endpoint and a token endpoint that checks the PKCE verifier and client secret).
 * After the provider, the email code to the school mailbox always follows; a new link is made
 * only after it. Accounts are found by the provider's subject, never by the email.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class IdpSignInTest {

    static final KeyPair KEYS, OTHER_KEYS;
    static final HttpServer FAKE;
    static final String BASE;
    /** What the fake token endpoint puts in the next ID token. */
    static final AtomicReference<Map<String, Object>> NEXT = new AtomicReference<>();
    static final AtomicReference<KeyPair> SIGN_WITH = new AtomicReference<>();
    static final AtomicReference<String> LAST_FORM = new AtomicReference<>("");

    static {
        try {
            KeyPairGenerator g = KeyPairGenerator.getInstance("RSA");
            g.initialize(2048);
            KEYS = g.generateKeyPair();
            OTHER_KEYS = g.generateKeyPair();
            FAKE = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            FAKE.createContext("/jwks", ex -> reply(ex, 200, jwks((RSAPublicKey) KEYS.getPublic())));
            FAKE.createContext("/token", ex -> {
                String form = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
                LAST_FORM.set(form);
                Map<String, String> f = new HashMap<>();
                for (String kv : form.split("&")) {
                    String[] p = kv.split("=", 2);
                    f.put(p[0], p.length > 1 ? URLDecoder.decode(p[1], StandardCharsets.UTF_8) : "");
                }
                if (!"test-secret".equals(f.get("client_secret")) || f.getOrDefault("code_verifier", "").length() < 43) {
                    reply(ex, 400, "{\"error\":\"invalid_grant\"}");
                    return;
                }
                reply(ex, 200, "{\"id_token\":\"" + token(NEXT.get(), SIGN_WITH.get()) + "\"}");
            });
            FAKE.start();
            BASE = "http://127.0.0.1:" + FAKE.getAddress().getPort();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @AfterAll
    static void stop() {
        FAKE.stop(0);
    }

    @DynamicPropertySource
    static void idp(DynamicPropertyRegistry r) {
        r.add("app.idp.redirect-uri", () -> "http://localhost:3000/login/idp-callback");
        r.add("app.idp.google.client-id", () -> "google-client");
        r.add("app.idp.google.client-secret", () -> "test-secret");
        r.add("app.idp.google.authorize-url", () -> BASE + "/g/auth");
        r.add("app.idp.google.token-url", () -> BASE + "/token");
        r.add("app.idp.google.jwks-url", () -> BASE + "/jwks");
        r.add("app.idp.microsoft.client-id", () -> "ms-client");
        r.add("app.idp.microsoft.client-secret", () -> "test-secret");
        r.add("app.idp.microsoft.authority", () -> BASE + "/ms");
        r.add("app.idp.microsoft.token-url", () -> BASE + "/token");
        r.add("app.idp.microsoft.jwks-url", () -> BASE + "/jwks");
    }

    static void reply(com.sun.net.httpserver.HttpExchange ex, int status, String body) throws java.io.IOException {
        byte[] b = body.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().add("Content-Type", "application/json");
        ex.sendResponseHeaders(status, b.length);
        try (OutputStream o = ex.getResponseBody()) {
            o.write(b);
        }
    }

    static String b64(BigInteger v) {
        byte[] bytes = v.toByteArray();
        if (bytes[0] == 0) bytes = Arrays.copyOfRange(bytes, 1, bytes.length);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    static String jwks(RSAPublicKey k) {
        return "{\"keys\":[{\"kty\":\"RSA\",\"kid\":\"k1\",\"use\":\"sig\",\"alg\":\"RS256\",\"n\":\"" + b64(k.getModulus()) + "\",\"e\":\"" + b64(k.getPublicExponent()) + "\"}]}";
    }

    static String token(Map<String, Object> claims, KeyPair signer) {
        Map<String, Object> c = new HashMap<>(claims);
        var b = Jwts.builder().header().keyId("k1").and()
                .issuer((String) c.remove("iss"))
                .audience().add((String) c.remove("aud")).and()
                .issuedAt(Date.from(Instant.now()))
                .expiration(Date.from(Instant.now().plusSeconds(((Number) c.getOrDefault("expIn", 300)).longValue())));
        c.remove("expIn");
        Object sub = c.remove("sub");
        if (sub != null) b.subject((String) sub);
        c.forEach(b::claim);
        return b.signWith(signer.getPrivate()).compact();
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired IdentityLinkRepository links;
    Api api;

    @BeforeEach
    void setUp() {
        api = new Api(mvc, json);
        SIGN_WITH.set(KEYS);
    }

    /** start -> (provider) -> complete; returns the complete response. */
    private JsonNode signIn(String provider, String email, Map<String, Object> claims) throws Exception {
        JsonNode s = api.post("/api/auth/idp/start", Map.of("provider", provider, "email", email));
        assertEquals(200, s.get("_status").asInt(), s.toString());
        String url = s.get("authorizeUrl").asText();
        Map<String, String> q = new HashMap<>();
        for (String kv : url.substring(url.indexOf('?') + 1).split("&")) {
            String[] p = kv.split("=", 2);
            q.put(p[0], URLDecoder.decode(p[1], StandardCharsets.UTF_8));
        }
        Map<String, Object> c = new HashMap<>(claims);
        c.putIfAbsent("nonce", q.get("nonce"));
        NEXT.set(c);
        return api.post("/api/auth/idp/complete", Map.of("state", q.get("state"), "code", "auth-code-123"));
    }

    private static Map<String, Object> google(String sub, String email, boolean verified) {
        return new HashMap<>(Map.of("iss", "https://accounts.google.com", "aud", "google-client", "sub", sub, "email", email, "email_verified", verified));
    }

    /** Email code -> session; returns the session JSON. */
    private JsonNode finish(JsonNode firstFactor) throws Exception {
        JsonNode ch = firstFactor.get("secondFactor");
        JsonNode v = api.post("/api/auth/staff/verify", Map.of("ticket", firstFactor.get("ticket").asText(),
                "challengeId", ch.get("challengeId").asText(), "code", ch.get("devCode").asText()));
        assertEquals(200, v.get("_status").asInt(), v.toString());
        return api.post("/api/auth/staff/session", Map.of("ticket", v.get("ticket").asText(),
                "membershipId", v.get("memberships").get(0).get("membershipId").asText()));
    }

    @Test
    @Order(1)
    void providersAppearOnlyWhenConfiguredAndTheUrlUsesPkce() throws Exception {
        JsonNode p = api.getJson("/api/auth/idp/providers", "none");
        assertEquals(List.of("MICROSOFT", "GOOGLE"), json.convertValue(p.get("providers"), List.class));
        JsonNode s = api.post("/api/auth/idp/start", Map.of("provider", "GOOGLE", "email", "admin@greenwoodvalley.edu.in"));
        String url = s.get("authorizeUrl").asText();
        assertTrue(url.startsWith(BASE + "/g/auth?client_id=google-client"), url);
        assertTrue(url.contains("code_challenge_method=S256") && url.contains("&nonce=") && url.contains("&state="), url);
        assertTrue(url.contains("redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Flogin%2Fidp-callback"), url);
        assertFalse(url.contains("test-secret"), "the client secret never reaches the browser");
        assertEquals("IDP_NOT_CONFIGURED", api.post("/api/auth/idp/start", Map.of("provider", "FACEBOOK")).get("code").asText());
    }

    @Test
    @Order(2)
    void anExistingAdminLinksGoogleAfterTheEmailCodeThenTheSubjectDecides() throws Exception {
        JsonNode ff = signIn("GOOGLE", "admin@greenwoodvalley.edu.in", google("g-sub-admin-1", "admin@greenwoodvalley.edu.in", true));
        assertEquals(200, ff.get("_status").asInt(), ff.toString());
        assertTrue(LAST_FORM.get().contains("code_verifier="), "the server sent the PKCE verifier");
        assertEquals("EMAIL", ff.get("secondFactor").get("channel").asText(), "the email code always follows");
        assertTrue(links.findByProviderAndSubject("GOOGLE", "g-sub-admin-1").isEmpty(), "no link before the email code");

        JsonNode s = finish(ff);
        assertEquals(200, s.get("_status").asInt(), s.toString());
        List<String> methods = json.convertValue(s.get("authMethods"), List.class);
        assertTrue(methods.containsAll(List.of("IDP_GOOGLE", "EMAIL_OTP")), methods.toString());
        assertEquals("ACC-L-0002", links.findByProviderAndSubject("GOOGLE", "g-sub-admin-1").orElseThrow().getAccountId());

        // Next time the subject finds the account, even if the Google email is now something else.
        JsonNode again = signIn("GOOGLE", "", google("g-sub-admin-1", "renamed@gmail.com", true));
        assertEquals(200, again.get("_status").asInt(), again.toString());
        assertEquals("ACC-L-0002", finish(again).get("userId").asText());
    }

    @Test
    @Order(3)
    void forgedExpiredOrMismatchedTokensAreRefused() throws Exception {
        Map<String, Object> ok = google("g-sub-admin-1", "admin@greenwoodvalley.edu.in", true);

        Map<String, Object> wrongAud = new HashMap<>(ok);
        wrongAud.put("aud", "someone-elses-app");
        assertEquals("IDP_FAILED", signIn("GOOGLE", "", wrongAud).get("code").asText(), "audience");

        Map<String, Object> wrongIss = new HashMap<>(ok);
        wrongIss.put("iss", "https://evil.example");
        assertEquals("IDP_FAILED", signIn("GOOGLE", "", wrongIss).get("code").asText(), "issuer");

        Map<String, Object> expired = new HashMap<>(ok);
        expired.put("expIn", -600);
        assertEquals("IDP_FAILED", signIn("GOOGLE", "", expired).get("code").asText(), "expired");

        Map<String, Object> wrongNonce = new HashMap<>(ok);
        wrongNonce.put("nonce", "replayed-nonce");
        assertEquals("IDP_FAILED", signIn("GOOGLE", "", wrongNonce).get("code").asText(), "nonce");

        SIGN_WITH.set(OTHER_KEYS);
        assertEquals("IDP_FAILED", signIn("GOOGLE", "", ok).get("code").asText(), "signed with a key the provider never published");
        SIGN_WITH.set(KEYS);

        // A state is single use.
        JsonNode s = api.post("/api/auth/idp/start", Map.of("provider", "GOOGLE"));
        String url = s.get("authorizeUrl").asText();
        String state = URLDecoder.decode(url.replaceAll(".*[?&]state=([^&]+).*", "$1"), StandardCharsets.UTF_8);
        String nonce = URLDecoder.decode(url.replaceAll(".*[?&]nonce=([^&]+).*", "$1"), StandardCharsets.UTF_8);
        Map<String, Object> c = new HashMap<>(ok);
        c.put("nonce", nonce);
        NEXT.set(c);
        assertEquals(200, api.post("/api/auth/idp/complete", Map.of("state", state, "code", "x")).get("_status").asInt());
        assertEquals("IDP_FAILED", api.post("/api/auth/idp/complete", Map.of("state", state, "code", "x")).get("code").asText());
    }

    @Test
    @Order(4)
    void unknownOrUnverifiedIdentitiesAreNotLinked() throws Exception {
        assertEquals("IDP_NOT_LINKED", signIn("GOOGLE", "", google("g-sub-stranger", "stranger@gmail.com", true)).get("code").asText());
        // An unverified Google email cannot find an account, even a real school one.
        assertEquals("IDP_NOT_LINKED", signIn("GOOGLE", "", google("g-sub-unverified", "office@greenwoodvalley.edu.in", false)).get("code").asText());
        // A wrong email code makes no link.
        JsonNode ff = signIn("GOOGLE", "", google("g-sub-office", "office@greenwoodvalley.edu.in", true));
        JsonNode bad = api.post("/api/auth/staff/verify", Map.of("ticket", ff.get("ticket").asText(),
                "challengeId", ff.get("secondFactor").get("challengeId").asText(), "code", "000000"));
        assertNotEquals(200, bad.get("_status").asInt());
        assertTrue(links.findByProviderAndSubject("GOOGLE", "g-sub-office").isEmpty());
    }

    @Test
    @Order(5)
    void microsoftChecksTheTenantIssuerAndLinksByTenantAndObjectId() throws Exception {
        Map<String, Object> ms = new HashMap<>(Map.of("iss", BASE + "/ms/tenant-123/v2.0", "aud", "ms-client", "tid", "tenant-123",
                "oid", "oid-principal", "preferred_username", "principal@greenwoodvalley.edu.in", "sub", "pairwise-sub"));
        JsonNode ff = signIn("MICROSOFT", "principal@greenwoodvalley.edu.in", ms);
        assertEquals(200, ff.get("_status").asInt(), ff.toString());
        assertEquals(200, finish(ff).get("_status").asInt());
        assertEquals("ACC-L-0001", links.findByProviderAndSubject("MICROSOFT", "tenant-123:oid-principal").orElseThrow().getAccountId());

        Map<String, Object> otherTenant = new HashMap<>(ms);
        otherTenant.put("iss", BASE + "/ms/attacker-tenant/v2.0");
        assertEquals("IDP_FAILED", signIn("MICROSOFT", "", otherTenant).get("code").asText(), "issuer must match the token's own tenant");

        // The same oid in another tenant is a different person.
        Map<String, Object> sameOidElsewhere = new HashMap<>(ms);
        sameOidElsewhere.put("tid", "tenant-999");
        sameOidElsewhere.put("iss", BASE + "/ms/tenant-999/v2.0");
        sameOidElsewhere.put("preferred_username", "someone@else.org");
        assertEquals("IDP_NOT_LINKED", signIn("MICROSOFT", "", sameOidElsewhere).get("code").asText());
    }
}
