package com.futureschool.backend;

import com.futureschool.backend.security.JwtUtil;
import io.jsonwebtoken.Claims;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
class BackendApplicationTests {

    @Autowired
    private JwtUtil jwtUtil;

    @Test
    void accessTokenCarriesSessionSchoolAndRole() {
        String token = jwtUtil.generateAccessToken("GRD-0001", "GRD-0001", "MEM-P-0001", "GVS", "parent", "Rajesh",
                "SES-1", "GVS-2027-0001", Instant.now().plusSeconds(60));
        Claims c = jwtUtil.parse(token, JwtUtil.TYPE_ACCESS);
        assertEquals("GVS", c.get("sid"));
        assertEquals("SES-1", c.get("ses"));
        assertEquals("GVS-2027-0001", c.get("stu"));
    }

    @Test
    void tamperedTokenIsRejected() {
        String token = jwtUtil.generateAccessToken("A", "A", "M", "GVS", "admin", "x", "S", null, Instant.now().plusSeconds(60));
        String[] parts = token.split("\\.");
        String forged = parts[0] + "." + parts[1].substring(0, parts[1].length() - 2) + "AA." + parts[2];
        assertThrows(Exception.class, () -> jwtUtil.parse(forged, JwtUtil.TYPE_ACCESS));
    }
}
