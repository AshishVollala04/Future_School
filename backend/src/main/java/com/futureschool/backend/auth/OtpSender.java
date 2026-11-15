package com.futureschool.backend.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;

/**
 * Delivers OTPs. Never logs the code.
 *
 * SMS (app.otp.sms.provider):
 *   log  - development only: logs the masked number.
 *   http - any DLT-registered SMS gateway (MSG91, Gupshup, Kaleyra, ...): POST to app.otp.sms.http.url
 *          with an auth header and a JSON body template where {{mobile}} (10 digits), {{code}} and
 *          {{minutes}} are replaced. The template must match the DLT-approved message template.
 * Email (app.otp.email.provider):
 *   log  - development only.
 *   smtp - standard spring.mail.* settings (SES, SendGrid, Zoho, Google Workspace SMTP ...).
 *
 * A delivery failure throws, and the sign-in step tells the person to try again.
 */
public interface OtpSender {

    void send(String channel, String destination, String code, String purpose);

    /** Plain wording for each purpose; never includes anything but the code and its lifetime. */
    static String purposeText(String purpose) {
        if (purpose == null) return "sign in";
        if (purpose.startsWith("STEP_UP_PAYMENT")) return "confirm a fee payment";
        if (purpose.startsWith("STEP_UP_PICKUP")) return "authorise an early pickup";
        if (purpose.startsWith("STEP_UP_")) return "confirm a sensitive action";
        return "sign in";
    }

    @Component
    class RoutingOtpSender implements OtpSender {
        private static final Logger log = LoggerFactory.getLogger(RoutingOtpSender.class);
        static final int TTL_MINUTES = 5;

        private final String smsProvider;
        private final String emailProvider;
        private final String smsUrl;
        private final String smsHeaderName;
        private final String smsHeaderValue;
        private final String smsBody;
        private final String emailFrom;
        private final ObjectProvider<JavaMailSender> mail;
        private final HttpClient http;
        private final ObjectMapper json = new ObjectMapper();

        public RoutingOtpSender(@Value("${app.otp.sms.provider:log}") String smsProvider,
                                @Value("${app.otp.email.provider:log}") String emailProvider,
                                @Value("${app.otp.sms.http.url:}") String smsUrl,
                                @Value("${app.otp.sms.http.header-name:authkey}") String smsHeaderName,
                                @Value("${app.otp.sms.http.header-value:}") String smsHeaderValue,
                                @Value("${app.otp.sms.http.body:}") String smsBody,
                                @Value("${app.otp.email.from:no-reply@futureschool.in}") String emailFrom,
                                ObjectProvider<JavaMailSender> mail) {
            this.smsProvider = smsProvider;
            this.emailProvider = emailProvider;
            this.smsUrl = smsUrl;
            this.smsHeaderName = smsHeaderName;
            this.smsHeaderValue = smsHeaderValue;
            this.smsBody = smsBody;
            this.emailFrom = emailFrom;
            this.mail = mail;
            this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
        }

        @Override
        public void send(String channel, String destination, String code, String purpose) {
            if ("SMS".equals(channel)) {
                if ("http".equals(smsProvider)) sendSms(destination, code);
                else log.info("OTP to {} {} via SMS (delivery not configured: development only)", purposeText(purpose), OtpService.mask(channel, destination));
            } else {
                if ("smtp".equals(emailProvider)) sendEmail(destination, code, purpose);
                else log.info("OTP to {} {} via email (delivery not configured: development only)", purposeText(purpose), OtpService.mask(channel, destination));
            }
        }

        /** JSON-escapes each value so a template can never be broken by input. */
        private String fill(String template, Map<String, String> values) {
            String out = template;
            for (Map.Entry<String, String> e : values.entrySet()) {
                try {
                    String quoted = json.writeValueAsString(e.getValue());
                    out = out.replace("{{" + e.getKey() + "}}", quoted.substring(1, quoted.length() - 1));
                } catch (Exception ex) {
                    throw new IllegalStateException(ex);
                }
            }
            return out;
        }

        void sendSms(String mobile, String code) {
            if (smsUrl.isBlank() || smsBody.isBlank()) throw new IllegalStateException("SMS gateway is not configured");
            String body = fill(smsBody, Map.of("mobile", mobile, "code", code, "minutes", String.valueOf(TTL_MINUTES)));
            HttpRequest.Builder req = HttpRequest.newBuilder(URI.create(smsUrl)).timeout(Duration.ofSeconds(10))
                    .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(body));
            if (!smsHeaderValue.isBlank()) req.header(smsHeaderName, smsHeaderValue);
            try {
                HttpResponse<String> res = http.send(req.build(), HttpResponse.BodyHandlers.ofString());
                if (res.statusCode() / 100 != 2) {
                    log.warn("SMS gateway refused the message for {} (HTTP {})", OtpService.mask("SMS", mobile), res.statusCode());
                    throw new IllegalStateException("SMS gateway returned " + res.statusCode());
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("SMS delivery interrupted", e);
            } catch (java.io.IOException e) {
                log.warn("SMS gateway unreachable for {}: {}", OtpService.mask("SMS", mobile), e.getMessage());
                throw new IllegalStateException("SMS gateway unreachable", e);
            }
        }

        void sendEmail(String email, String code, String purpose) {
            JavaMailSender sender = mail.getIfAvailable();
            if (sender == null) throw new IllegalStateException("Email (spring.mail.*) is not configured");
            SimpleMailMessage m = new SimpleMailMessage();
            m.setFrom(emailFrom);
            m.setTo(email);
            m.setSubject("Your FutureSchool code: " + code);
            m.setText("Use " + code + " to " + purposeText(purpose) + " in FutureSchool.\n\n"
                    + "The code expires in " + TTL_MINUTES + " minutes and works once. FutureSchool will never ask you for this code by phone.\n"
                    + "If you did not try to " + purposeText(purpose) + ", you can ignore this email.");
            try {
                sender.send(m);
            } catch (RuntimeException e) {
                log.warn("Email delivery failed for {}: {}", OtpService.mask("EMAIL", email), e.getMessage());
                throw new IllegalStateException("Email delivery failed", e);
            }
        }
    }
}
