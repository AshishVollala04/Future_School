package com.futureschool.backend.config;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.Profiles;

import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Normalizes cloud Postgres URLs (such as Neon, Render, or Railway connection strings) so pasting
 * a single `DATABASE_URL` or `DB_URL` like `postgresql://user:pass@ep-x-pooler.aws.neon.tech/neondb?sslmode=require&channel_binding=require`
 * configures Spring Boot JDBC + Flyway cleanly without manual string reformatting.
 *
 * Also derives `spring.flyway.url` without `-pooler` when Neon's pooled endpoint is provided, since
 * Flyway requires a direct (non-PgBouncer) Postgres connection for advisory locks.
 */
public class DatabaseUrlEnvironmentPostProcessor implements EnvironmentPostProcessor, Ordered {

    static final String PROPERTY_SOURCE_NAME = "cloudDatabaseUrlOverrides";

    @Override
    public int getOrder() {
        return Ordered.LOWEST_PRECEDENCE;
    }

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment env, SpringApplication application) {
        if (env.acceptsProfiles(Profiles.of("test"))) return;
        String raw = firstNonBlank(env.getProperty("DB_URL"), env.getProperty("DATABASE_URL"));
        if (raw == null) return;

        Map<String, Object> overrides = parse(raw.trim());
        if (!overrides.isEmpty()) {
            env.getPropertySources().addFirst(new MapPropertySource(PROPERTY_SOURCE_NAME, overrides));
        }
    }

    static Map<String, Object> parse(String raw) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (raw == null || raw.isBlank()) return out;

        if (raw.startsWith("jdbc:postgresql://")) {
            String fixed = normalizeJdbcUrl(raw);
            if (!fixed.equals(raw)) {
                out.put("spring.datasource.url", fixed);
            }
            String direct = stripNeonPooler(fixed);
            if (!direct.equals(fixed)) {
                out.put("spring.flyway.url", direct);
            }
            return out;
        }

        if (!raw.startsWith("postgres://") && !raw.startsWith("postgresql://")) {
            return out;
        }

        String normalizedScheme = raw.startsWith("postgresql://")
                ? "http://" + raw.substring("postgresql://".length())
                : "http://" + raw.substring("postgres://".length());

        URI uri = URI.create(normalizedScheme);
        String host = uri.getHost();
        if (host == null || host.isBlank()) return out;

        int port = uri.getPort() > 0 ? uri.getPort() : 5432;
        String path = (uri.getRawPath() == null || uri.getRawPath().isBlank()) ? "/postgres" : uri.getRawPath();
        String query = filterQuery(uri.getRawQuery());

        String jdbcUrl = "jdbc:postgresql://" + host + ":" + port + path + (query.isEmpty() ? "" : "?" + query);
        out.put("spring.datasource.url", jdbcUrl);

        String userInfo = uri.getRawUserInfo();
        String user = null;
        String pass = null;
        if (userInfo != null && !userInfo.isEmpty()) {
            int colon = userInfo.indexOf(':');
            if (colon >= 0) {
                user = decodePercent(userInfo.substring(0, colon));
                pass = decodePercent(userInfo.substring(colon + 1));
            } else {
                user = decodePercent(userInfo);
            }
        }
        if (user != null && !user.isEmpty()) out.put("spring.datasource.username", user);
        if (pass != null) out.put("spring.datasource.password", pass);

        String directJdbc = stripNeonPooler(jdbcUrl);
        if (!directJdbc.equals(jdbcUrl)) {
            out.put("spring.flyway.url", directJdbc);
            if (user != null && !user.isEmpty()) out.put("spring.flyway.user", user);
            if (pass != null) out.put("spring.flyway.password", pass);
        }

        return out;
    }

    private static String normalizeJdbcUrl(String jdbc) {
        int q = jdbc.indexOf('?');
        if (q < 0) return jdbc;
        String filtered = filterQuery(jdbc.substring(q + 1));
        return jdbc.substring(0, q) + (filtered.isEmpty() ? "" : "?" + filtered);
    }

    private static String filterQuery(String rawQuery) {
        if (rawQuery == null || rawQuery.isBlank()) return "";
        // pgJDBC rejects snake_case `channel_binding=require` (Neon libpq default); sslmode=require already enforces TLS.
        return Arrays.stream(rawQuery.split("&"))
                .filter(p -> !p.isBlank())
                .filter(p -> !p.toLowerCase().startsWith("channel_binding="))
                .collect(Collectors.joining("&"));
    }

    private static String stripNeonPooler(String jdbcUrl) {
        return jdbcUrl.replace("-pooler.", ".");
    }

    private static String decodePercent(String s) {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '%' && i + 2 < s.length()) {
                int hi = Character.digit(s.charAt(i + 1), 16);
                int lo = Character.digit(s.charAt(i + 2), 16);
                if (hi >= 0 && lo >= 0) {
                    bytes.write((hi << 4) + lo);
                    i += 2;
                    continue;
                }
            }
            byte[] utf8 = String.valueOf(c).getBytes(StandardCharsets.UTF_8);
            bytes.write(utf8, 0, utf8.length);
        }
        return bytes.toString(StandardCharsets.UTF_8);
    }

    private static String firstNonBlank(String... values) {
        for (String v : values) {
            if (v != null && !v.isBlank()) return v;
        }
        return null;
    }
}
