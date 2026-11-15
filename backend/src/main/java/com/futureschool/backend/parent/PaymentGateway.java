package com.futureschool.backend.parent;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.futureschool.backend.auth.AuthFlowException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.*;

/**
 * Payment gateway abstraction (mock vs Razorpay / UPI).
 * Never stores card numbers, CVV, UPI PIN, VPA, or bank passwords.
 */
public interface PaymentGateway {

    record ProviderOrder(String providerOrderId, long amountPaise, String currency) {
    }

    String provider();

    boolean isRazorpay();

    String keyId();

    ProviderOrder createOrder(String localOrderId, long amountRupees, String schoolId, String studentId);

    boolean verifyCheckoutSignature(String razorpayOrderId, String razorpayPaymentId, String signature);

    boolean verifyWebhookSignature(byte[] rawPayload, String signature);

    @Component
    class Routing implements PaymentGateway {
        private static final Logger log = LoggerFactory.getLogger(Routing.class);

        private final String provider;
        private final String keyId;
        private final String keySecret;
        private final String webhookSecret;
        private final String baseUrl;
        private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
        private final ObjectMapper json = new ObjectMapper();

        public Routing(@Value("${app.payments.provider:mock}") String provider,
                       @Value("${app.payments.razorpay.key-id:}") String keyId,
                       @Value("${app.payments.razorpay.key-secret:}") String keySecret,
                       @Value("${app.payments.razorpay.webhook-secret:}") String webhookSecret,
                       @Value("${app.payments.razorpay.base-url:https://api.razorpay.com/v1}") String baseUrl) {
            this.provider = "razorpay".equalsIgnoreCase(provider == null ? "" : provider.trim()) ? "razorpay" : "mock";
            this.keyId = keyId == null ? "" : keyId.trim();
            this.keySecret = keySecret == null ? "" : keySecret.trim();
            this.webhookSecret = webhookSecret == null ? "" : webhookSecret.trim();
            this.baseUrl = (baseUrl == null || baseUrl.isBlank() ? "https://api.razorpay.com/v1" : baseUrl.trim()).replaceAll("/+$", "");
            if ("razorpay".equals(this.provider) && (this.keyId.isBlank() || this.keySecret.isBlank() || this.webhookSecret.isBlank())) {
                throw new IllegalStateException("app.payments.provider=razorpay requires razorpay key-id, key-secret, and webhook-secret");
            }
        }

        @Override
        public String provider() {
            return provider;
        }

        @Override
        public boolean isRazorpay() {
            return "razorpay".equals(provider);
        }

        @Override
        public String keyId() {
            return isRazorpay() ? keyId : null;
        }

        @Override
        public ProviderOrder createOrder(String localOrderId, long amountRupees, String schoolId, String studentId) {
            long amountPaise = Math.multiplyExact(amountRupees, 100L);
            if (!isRazorpay()) {
                return new ProviderOrder(localOrderId, amountPaise, "INR");
            }
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("amount", amountPaise);
            body.put("currency", "INR");
            body.put("receipt", localOrderId);
            body.put("notes", Map.of("schoolId", schoolId, "studentId", studentId, "localOrderId", localOrderId));
            try {
                String auth = Base64.getEncoder().encodeToString((keyId + ":" + keySecret).getBytes(StandardCharsets.UTF_8));
                HttpRequest req = HttpRequest.newBuilder(URI.create(baseUrl + "/orders"))
                        .timeout(Duration.ofSeconds(10))
                        .header("Authorization", "Basic " + auth)
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)))
                        .build();
                HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
                if (res.statusCode() < 200 || res.statusCode() >= 300) {
                    log.warn("Razorpay order creation failed with status {}", res.statusCode());
                    throw new AuthFlowException("GATEWAY_ERROR", "Unable to start payment with Razorpay right now. Please try again.", null, 502);
                }
                JsonNode node = json.readTree(res.body());
                String rzpOrderId = node.path("id").asText("");
                if (rzpOrderId.isBlank()) {
                    throw new AuthFlowException("GATEWAY_ERROR", "Payment gateway returned an invalid order.", null, 502);
                }
                long returnedPaise = node.path("amount").asLong(amountPaise);
                String currency = node.path("currency").asText("INR");
                return new ProviderOrder(rzpOrderId, returnedPaise, currency);
            } catch (AuthFlowException e) {
                throw e;
            } catch (Exception e) {
                log.warn("Razorpay order creation error: {}", e.getMessage());
                throw new AuthFlowException("GATEWAY_ERROR", "Could not reach Razorpay. Please try again.", null, 502);
            }
        }

        @Override
        public boolean verifyCheckoutSignature(String razorpayOrderId, String razorpayPaymentId, String signature) {
            if (!isRazorpay() || razorpayOrderId == null || razorpayPaymentId == null || signature == null) return false;
            String payload = razorpayOrderId + "|" + razorpayPaymentId;
            return matchesHmac(payload.getBytes(StandardCharsets.UTF_8), keySecret, signature);
        }

        @Override
        public boolean verifyWebhookSignature(byte[] rawPayload, String signature) {
            if (!isRazorpay() || rawPayload == null || signature == null) return false;
            return matchesHmac(rawPayload, webhookSecret, signature);
        }

        public static boolean matchesHmac(byte[] data, String secret, String providedHex) {
            if (secret == null || secret.isBlank() || providedHex == null || providedHex.isBlank()) return false;
            String expected = hmacSha256Hex(data, secret);
            byte[] a = expected.getBytes(StandardCharsets.UTF_8);
            byte[] b = providedHex.trim().toLowerCase(Locale.ROOT).getBytes(StandardCharsets.UTF_8);
            return a.length == b.length && MessageDigest.isEqual(a, b);
        }

        public static String hmacSha256Hex(byte[] data, String secret) {
            try {
                Mac mac = Mac.getInstance("HmacSHA256");
                mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
                byte[] digest = mac.doFinal(data);
                StringBuilder sb = new StringBuilder(digest.length * 2);
                for (byte b : digest) {
                    sb.append(Character.forDigit((b >> 4) & 0xF, 16));
                    sb.append(Character.forDigit(b & 0xF, 16));
                }
                return sb.toString();
            } catch (Exception e) {
                throw new IllegalStateException("HMAC-SHA256 unavailable", e);
            }
        }
    }
}
