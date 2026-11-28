package com.futureschool.backend.config;

import org.springframework.beans.factory.InitializingBean;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * With the "prod" profile, refuse to start unless the settings are safe for real families:
 * OTP codes are never returned in API responses, no demo accounts are seeded, OTPs are really
 * delivered, the JWT secret is not the development one, CORS does not allow localhost, and
 * Hibernate does not change the schema (Flyway migrations do).
 */
@Component
public class ProductionSafetyCheck implements InitializingBean {

    static final String DEV_JWT_SECRET = "FutureschoolSecretKeyForJwtTokenGenerationSecurityMustBe256BitsLongAtLeast123456";

    private final Environment env;

    public ProductionSafetyCheck(Environment env) {
        this.env = env;
    }

    public static List<String> problems(Environment env) {
        List<String> p = new ArrayList<>();
        if (env.getProperty("app.otp.dev-reveal", Boolean.class, false)) p.add("app.otp.dev-reveal must be false (codes would be shown on screen)");
        if (!env.getProperty("app.otp.fixed-code", "").isBlank()) p.add("app.otp.fixed-code must be blank (random OTPs required in production)");
        if (env.getProperty("app.seed.demo-data", Boolean.class, true)) p.add("app.seed.demo-data must be false (demo accounts with known passwords)");
        if (env.getProperty("app.seed.future-school", Boolean.class, false)) p.add("app.seed.future-school must be false in production");
        if (!"http".equals(env.getProperty("app.otp.sms.provider", "log"))) p.add("app.otp.sms.provider must be http (a real SMS gateway)");
        if (!"smtp".equals(env.getProperty("app.otp.email.provider", "log"))) p.add("app.otp.email.provider must be smtp (real email)");
        String secret = env.getProperty("jwt.secret", "");
        if (secret.length() < 64 || DEV_JWT_SECRET.equals(secret)) p.add("jwt.secret must be a new random value of 64+ characters (set JWT_SECRET)");
        if (env.getProperty("app.cors.allowed-origins", "").contains("localhost")) p.add("app.cors.allowed-origins must list only the real app address");
        String ddl = env.getProperty("spring.jpa.hibernate.ddl-auto", "none");
        if (!"validate".equals(ddl) && !"none".equals(ddl)) p.add("spring.jpa.hibernate.ddl-auto must be validate (Flyway owns the schema)");
        p.addAll(com.futureschool.backend.auth.IdpService.problems(env));
        return p;
    }

    @Override
    public void afterPropertiesSet() {
        if (!env.acceptsProfiles(Profiles.of("prod"))) return;
        List<String> p = problems(env);
        if (!p.isEmpty()) {
            throw new IllegalStateException("Refusing to start with the prod profile:\n - " + String.join("\n - ", p));
        }
    }
}
