package com.futureschool.backend.alerts;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.*;

/**
 * Delivers parent alerts. Never logs the mobile number in full or the message text.
 *
 * app.alerts.provider:
 *   log            - nothing is delivered. Alerts are recorded as LOGGED so the office can see
 *                    exactly what would have gone out. This is the default.
 *   whatsapp-cloud - Meta WhatsApp Cloud API with pre-approved message templates
 *                    (business-initiated messages must use a template). Needs
 *                    app.alerts.whatsapp.phone-number-id and app.alerts.whatsapp.token.
 */
public interface AlertSender {

    /** delivered = the provider accepted it. retry = worth trying again later. */
    record Outcome(boolean delivered, boolean logged, String ref, String error, boolean retry) {
        static Outcome loggedOnly() {
            return new Outcome(false, true, null, null, false);
        }
    }

    Outcome send(String kind, String mobile10, List<String> params);

    /** "log" or "whatsapp-cloud". */
    String provider();

    /** True only when messages really leave the server. */
    boolean connected();

    @Component
    class Routing implements AlertSender {
        private static final Logger log = LoggerFactory.getLogger(Routing.class);

        private final String provider;
        private final String phoneNumberId;
        private final String token;
        private final String apiVersion;
        private final String language;
        private final Map<String, String> templates;
        private final String baseUrl;
        private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
        private final ObjectMapper json = new ObjectMapper();

        public Routing(@Value("${app.alerts.provider:log}") String provider,
                       @Value("${app.alerts.whatsapp.phone-number-id:}") String phoneNumberId,
                       @Value("${app.alerts.whatsapp.token:}") String token,
                       @Value("${app.alerts.whatsapp.api-version:v21.0}") String apiVersion,
                       @Value("${app.alerts.whatsapp.language:en}") String language,
                       @Value("${app.alerts.whatsapp.template.absent:student_absent}") String absentTemplate,
                       @Value("${app.alerts.whatsapp.template.fee-due:fee_reminder}") String feeTemplate,
                       @Value("${app.alerts.whatsapp.base-url:https://graph.facebook.com}") String baseUrl) {
            this.provider = provider == null ? "log" : provider.trim();
            this.phoneNumberId = phoneNumberId;
            this.token = token;
            this.apiVersion = apiVersion;
            this.language = language;
            this.templates = Map.of("ABSENT", absentTemplate, "FEE_DUE", feeTemplate);
            this.baseUrl = baseUrl;
            if ("whatsapp-cloud".equals(this.provider) && (phoneNumberId.isBlank() || token.isBlank())) {
                throw new IllegalStateException("app.alerts.provider=whatsapp-cloud needs app.alerts.whatsapp.phone-number-id and app.alerts.whatsapp.token");
            }
        }

        @Override
        public String provider() {
            return "whatsapp-cloud".equals(provider) ? "whatsapp-cloud" : "log";
        }

        @Override
        public boolean connected() {
            return "whatsapp-cloud".equals(provider);
        }

        static String mask(String mobile) {
            return mobile == null || mobile.length() < 4 ? "******" : "******" + mobile.substring(mobile.length() - 4);
        }

        @Override
        public Outcome send(String kind, String mobile10, List<String> params) {
            if (!connected()) {
                log.info("{} alert for {} recorded only (WhatsApp is not connected)", kind, mask(mobile10));
                return Outcome.loggedOnly();
            }
            String template = templates.get(kind);
            if (template == null) return new Outcome(false, false, null, "No template for " + kind, false);
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("messaging_product", "whatsapp");
            body.put("to", "91" + mobile10);
            body.put("type", "template");
            List<Map<String, String>> ps = params.stream().map(p -> Map.of("type", "text", "text", p)).toList();
            body.put("template", Map.of("name", template, "language", Map.of("code", language),
                    "components", List.of(Map.of("type", "body", "parameters", ps))));
            try {
                HttpRequest req = HttpRequest.newBuilder(URI.create(baseUrl + "/" + apiVersion + "/" + phoneNumberId + "/messages"))
                        .timeout(Duration.ofSeconds(10))
                        .header("Authorization", "Bearer " + token)
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build();
                HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
                int code = res.statusCode();
                if (code / 100 == 2) {
                    JsonNode n = json.readTree(res.body());
                    String ref = n.path("messages").path(0).path("id").asText(null);
                    return new Outcome(true, false, ref, null, false);
                }
                String reason = "HTTP " + code;
                try {
                    reason = reason + ": " + json.readTree(res.body()).path("error").path("message").asText("");
                } catch (Exception ignored) {
                    // body was not JSON
                }
                log.warn("WhatsApp refused a {} alert for {} ({})", kind, mask(mobile10), "HTTP " + code);
                // 429 and 5xx are temporary; 4xx (bad number, template not approved) will not fix itself.
                return new Outcome(false, false, null, reason.length() > 290 ? reason.substring(0, 290) : reason, code == 429 || code >= 500);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return new Outcome(false, false, null, "Interrupted", true);
            } catch (Exception e) {
                log.warn("WhatsApp unreachable for a {} alert: {}", kind, e.getMessage());
                return new Outcome(false, false, null, "WhatsApp unreachable", true);
            }
        }
    }
}
