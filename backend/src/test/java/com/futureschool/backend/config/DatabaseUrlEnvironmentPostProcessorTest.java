package com.futureschool.backend.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.mock.env.MockEnvironment;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class DatabaseUrlEnvironmentPostProcessorTest {

    @Test
    void parsesNeonPooledConnectionStringAndDerivesDirectFlywayUrl() {
        String neon = "postgresql://neondb_owner:npg_ab%2B12%40xy@ep-quiet-hall-a1b2c3-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
        Map<String, Object> parsed = DatabaseUrlEnvironmentPostProcessor.parse(neon);

        assertEquals("jdbc:postgresql://ep-quiet-hall-a1b2c3-pooler.ap-southeast-1.aws.neon.tech:5432/neondb?sslmode=require",
                parsed.get("spring.datasource.url"));
        assertEquals("neondb_owner", parsed.get("spring.datasource.username"));
        assertEquals("npg_ab+12@xy", parsed.get("spring.datasource.password"));

        assertEquals("jdbc:postgresql://ep-quiet-hall-a1b2c3.ap-southeast-1.aws.neon.tech:5432/neondb?sslmode=require",
                parsed.get("spring.flyway.url"));
        assertEquals("neondb_owner", parsed.get("spring.flyway.user"));
        assertEquals("npg_ab+12@xy", parsed.get("spring.flyway.password"));
    }

    @Test
    void parsesPostgresSchemeWithoutPortAndPreservesPlusSign() {
        Map<String, Object> parsed = DatabaseUrlEnvironmentPostProcessor.parse("postgres://u1:pa+ss@db.example.com/futureschool");
        assertEquals("jdbc:postgresql://db.example.com:5432/futureschool", parsed.get("spring.datasource.url"));
        assertEquals("u1", parsed.get("spring.datasource.username"));
        assertEquals("pa+ss", parsed.get("spring.datasource.password"));
        assertFalse(parsed.containsKey("spring.flyway.url"));
    }

    @Test
    void skipsOverridesUnderTestProfile() {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles("test");
        env.setProperty("DATABASE_URL", "postgresql://u:p@host/db");
        new DatabaseUrlEnvironmentPostProcessor().postProcessEnvironment(env, new SpringApplication());
        assertFalse(env.getPropertySources().contains(DatabaseUrlEnvironmentPostProcessor.PROPERTY_SOURCE_NAME));
    }
}
