package com.futureschool.backend;

import org.springframework.boot.SpringApplication;

/**
 * Local run without PostgreSQL: in-memory H2 + demo seed (test profile).
 *   ./mvnw spring-boot:test-run -Dspring-boot.run.profiles=test
 * Data is lost on stop. For development and end-to-end checks only.
 */
public class TestBackendApplication {
    public static void main(String[] args) {
        SpringApplication.from(BackendApplication::main).run(args);
    }
}
