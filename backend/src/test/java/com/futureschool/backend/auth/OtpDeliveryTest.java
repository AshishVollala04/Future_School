package com.futureschool.backend.auth;

import com.futureschool.backend.config.ProductionSafetyCheck;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mock.env.MockEnvironment;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** OTP delivery (HTTP SMS gateway, SMTP email) and the production start-up guard. No network needed. */
class OtpDeliveryTest {

    HttpServer server;

    @AfterEach
    void stop() {
        if (server != null) server.stop(0);
    }

    private String startGateway(int status, AtomicReference<String> body, AtomicReference<String> key) throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/sms", ex -> {
            body.set(new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            key.set(ex.getRequestHeaders().getFirst("authkey"));
            ex.sendResponseHeaders(status, 2);
            try (OutputStream o = ex.getResponseBody()) {
                o.write("ok".getBytes());
            }
        });
        server.start();
        return "http://127.0.0.1:" + server.getAddress().getPort() + "/sms";
    }

    @SuppressWarnings("unchecked")
    private static ObjectProvider<JavaMailSender> provider(JavaMailSender m) {
        ObjectProvider<JavaMailSender> p = mock(ObjectProvider.class);
        when(p.getIfAvailable()).thenReturn(m);
        return p;
    }

    @Test
    void smsGoesToTheGatewayWithTheTemplateFilledIn() throws Exception {
        AtomicReference<String> body = new AtomicReference<>(), key = new AtomicReference<>();
        String url = startGateway(200, body, key);
        var sender = new OtpSender.RoutingOtpSender("http", "log", url, "authkey", "secret-key",
                "{\"template_id\":\"T1\",\"recipients\":[{\"mobiles\":\"91{{mobile}}\",\"otp\":\"{{code}}\",\"mins\":\"{{minutes}}\"}]}",
                "no-reply@x.in", provider(null));
        sender.send("SMS", "9876543210", "123456", "PARENT_LOGIN");
        assertEquals("{\"template_id\":\"T1\",\"recipients\":[{\"mobiles\":\"919876543210\",\"otp\":\"123456\",\"mins\":\"5\"}]}", body.get());
        assertEquals("secret-key", key.get());
    }

    @Test
    void gatewayRefusalIsAFailureNotASilentSuccess() throws Exception {
        String url = startGateway(500, new AtomicReference<>(), new AtomicReference<>());
        var sender = new OtpSender.RoutingOtpSender("http", "log", url, "authkey", "k", "{\"to\":\"{{mobile}}\",\"otp\":\"{{code}}\"}", "x@x.in", provider(null));
        assertThrows(IllegalStateException.class, () -> sender.send("SMS", "9876543210", "123456", "PARENT_LOGIN"));
        var unconfigured = new OtpSender.RoutingOtpSender("http", "log", "", "authkey", "", "", "x@x.in", provider(null));
        assertThrows(IllegalStateException.class, () -> unconfigured.send("SMS", "9876543210", "123456", "PARENT_LOGIN"));
    }

    @Test
    void emailSaysWhatTheCodeIsForAndNothingElse() {
        JavaMailSender mail = mock(JavaMailSender.class);
        var sender = new OtpSender.RoutingOtpSender("log", "smtp", "", "authkey", "", "", "no-reply@futureschool.in", provider(mail));
        sender.send("EMAIL", "principal@greenwoodvalley.edu.in", "654321", "STEP_UP_PAYMENT");
        var captor = org.mockito.ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mail).send(captor.capture());
        SimpleMailMessage m = captor.getValue();
        assertEquals("principal@greenwoodvalley.edu.in", m.getTo()[0]);
        assertEquals("no-reply@futureschool.in", m.getFrom());
        assertTrue(m.getText().contains("654321") && m.getText().contains("confirm a fee payment") && m.getText().contains("5 minutes"));

        doThrow(new org.springframework.mail.MailSendException("down")).when(mail).send(any(SimpleMailMessage.class));
        assertThrows(IllegalStateException.class, () -> sender.send("EMAIL", "a@b.in", "1", "STAFF_SECOND_FACTOR"));
        var noMail = new OtpSender.RoutingOtpSender("log", "smtp", "", "authkey", "", "", "x@x.in", provider(null));
        assertThrows(IllegalStateException.class, () -> noMail.send("EMAIL", "a@b.in", "1", "STAFF_SECOND_FACTOR"));
    }

    @Test
    void productionRefusesUnsafeSettings() {
        MockEnvironment dev = new MockEnvironment().withProperty("app.otp.dev-reveal", "true")
                .withProperty("app.otp.fixed-code", "123456")
                .withProperty("app.seed.demo-data", "true")
                .withProperty("app.seed.future-school", "true")
                .withProperty("jwt.secret", "FutureschoolSecretKeyForJwtTokenGenerationSecurityMustBe256BitsLongAtLeast123456")
                .withProperty("app.cors.allowed-origins", "http://localhost:5173").withProperty("spring.jpa.hibernate.ddl-auto", "update");
        dev.setActiveProfiles("prod");
        IllegalStateException e = assertThrows(IllegalStateException.class, () -> new ProductionSafetyCheck(dev).afterPropertiesSet());
        assertTrue(e.getMessage().contains("dev-reveal") && e.getMessage().contains("fixed-code")
                && e.getMessage().contains("demo-data") && e.getMessage().contains("future-school")
                && e.getMessage().contains("jwt.secret")
                && e.getMessage().contains("sms.provider") && e.getMessage().contains("cors") && e.getMessage().contains("ddl-auto"), e.getMessage());

        MockEnvironment safe = new MockEnvironment().withProperty("app.otp.dev-reveal", "false").withProperty("app.seed.demo-data", "false")
                .withProperty("app.otp.fixed-code", "").withProperty("app.seed.future-school", "false")
                .withProperty("app.otp.sms.provider", "http").withProperty("app.otp.email.provider", "smtp")
                .withProperty("jwt.secret", "x".repeat(64)).withProperty("app.cors.allowed-origins", "https://app.futureschool.in")
                .withProperty("spring.jpa.hibernate.ddl-auto", "validate");
        safe.setActiveProfiles("prod");
        assertDoesNotThrow(() -> new ProductionSafetyCheck(safe).afterPropertiesSet());

        MockEnvironment notProd = new MockEnvironment().withProperty("app.otp.dev-reveal", "true");
        assertDoesNotThrow(() -> new ProductionSafetyCheck(notProd).afterPropertiesSet(), "development is not blocked");
    }

    @Test
    void fixedCodePersistsDevCodeAndVerifiesViaChallengeRepository() {
        var repo = mock(com.futureschool.backend.repository.OtpChallengeRepository.class);
        when(repo.countByDestinationAndCreatedAtAfter(anyString(), any())).thenReturn(0L);
        var savedRef = new AtomicReference<com.futureschool.backend.entity.OtpChallenge>();
        when(repo.save(any())).thenAnswer(inv -> {
            var ch = (com.futureschool.backend.entity.OtpChallenge) inv.getArgument(0);
            savedRef.set(ch);
            return ch;
        });
        when(repo.findById(anyString())).thenAnswer(inv -> java.util.Optional.ofNullable(savedRef.get()));

        OtpSender noopSender = (channel, dest, code, purpose) -> {};
        OtpService svc = new OtpService(repo, noopSender, "test-pepper-secret-01234567890123456789", true, 50, "123456");
        OtpService.ChallengeView issued = svc.issue("SMS", "9876543210", "PARENT_LOGIN", null);

        assertEquals("123456", issued.devCode());
        assertNotNull(savedRef.get());
        assertEquals("123456", savedRef.get().getDevCode());

        var verified = svc.verify(issued.challengeId(), "123456", "PARENT_LOGIN", null);
        assertTrue(verified.isConsumed());
    }
}
