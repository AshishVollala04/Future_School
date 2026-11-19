package com.futureschool.backend.security;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.enums.SecuritySchemeType;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.security.SecurityScheme;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

/**
 * Request authorization, in the order the backend checks access:
 *   School  - the tenant filter (school_id from the access token only)
 *   Role    - the rules below, from the membership in the token
 *   Relationship - AccessPolicy (a parent sees only linked children)
 *   Business rules - in services
 *
 * Unknown routes are denied. People records are never hard-deleted (deactivate instead).
 * No endpoint ranks students.
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@OpenAPIDefinition(
        info = @Info(title = "FutureSchool API", version = "1.0", description = "Multi-school School Management API"),
        security = @SecurityRequirement(name = "bearerAuth")
)
@SecurityScheme(name = "bearerAuth", type = SecuritySchemeType.HTTP, scheme = "bearer", bearerFormat = "JWT")
public class SecurityConfig {

    private static final String[] STAFF = {"ADMIN", "PRINCIPAL", "TEACHER"};
    private static final String[] LEADERSHIP = {"ADMIN", "PRINCIPAL"};

    private final JwtAuthenticationFilter jwtAuthFilter;
    private final AccessPolicy access;

    @Value("${app.cors.allowed-origins:http://localhost:3000,http://localhost:5173}")
    private String allowedOrigins;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthFilter, AccessPolicy access) {
        this.jwtAuthFilter = jwtAuthFilter;
        this.access = access;
    }

    private AuthorizationManager<RequestAuthorizationContext> canReadStudent(String var) {
        return (auth, ctx) -> new AuthorizationDecision(access.canReadStudent(auth.get(), ctx.getVariables().get(var)));
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .cors(Customizer.withDefaults())
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .exceptionHandling(e -> e.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
                .authorizeHttpRequests(auth -> auth
                        // --- public
                        .requestMatchers(HttpMethod.POST, "/api/auth/otp/request", "/api/auth/otp/resend",
                                "/api/auth/parent/verify", "/api/auth/parent/session",
                                "/api/auth/teacher/verify", "/api/auth/teacher/session",
                                "/api/auth/teacher/pin-login", "/api/auth/teacher/device/forget", "/api/auth/parent/pin-login",
                                "/api/auth/idp/start", "/api/auth/idp/complete",
                                "/api/auth/staff/password", "/api/auth/staff/verify", "/api/auth/staff/session").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/auth/invitations/*").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/auth/idp/providers").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/invitations/*/accept").permitAll()
                        // No online payments: parents pay at the school counter; finance staff record it (/api/office/fees/cash).
                        .requestMatchers("/api/payments/**", "/api/parent/fees/orders", "/api/parent/fees/orders/**").denyAll()
                        // Bus driver link pages: the unguessable token in the path is the key (only its hash is stored).
                        .requestMatchers(HttpMethod.GET, "/api/public/bus/*").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/public/bus/*/start", "/api/public/bus/*/ping", "/api/public/bus/*/end",
                                "/api/public/bus/*/stops/*/here").permitAll()
                        .requestMatchers("/swagger-ui/**", "/v3/api-docs/**", "/swagger-ui.html", "/error").permitAll()
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()

                        // --- never
                        .requestMatchers("/api/analytics/leaderboard").denyAll()
                        .requestMatchers(HttpMethod.DELETE, "/api/students/**", "/api/teachers/**", "/api/parents/**", "/api/auth/users/**", "/api/classes/*").denyAll()

                        // --- account & staff access
                        .requestMatchers(HttpMethod.GET, "/api/auth/me").authenticated()
                        .requestMatchers(HttpMethod.PUT, "/api/auth/change-password").hasAnyRole(LEADERSHIP)
                        .requestMatchers(HttpMethod.POST, "/api/auth/logout", "/api/auth/step-up/request", "/api/auth/step-up/verify").authenticated()
                        .requestMatchers(HttpMethod.POST, "/api/auth/step-up/pin").hasRole("PARENT")
                        .requestMatchers(HttpMethod.POST, "/api/auth/teacher/device").hasRole("TEACHER")
                        .requestMatchers(HttpMethod.POST, "/api/auth/parent/device").hasRole("PARENT")
                        .requestMatchers(HttpMethod.POST, "/api/auth/parent/switch").hasRole("PARENT")
                        .requestMatchers("/api/auth/register", "/api/auth/users/**", "/api/auth/users").hasRole("ADMIN")

                        // --- school profile & settings
                        .requestMatchers(HttpMethod.GET, "/api/schools/current").authenticated()
                        .requestMatchers(HttpMethod.PUT, "/api/schools/current").hasAnyRole(LEADERSHIP)

                        // --- administration
                        .requestMatchers(HttpMethod.GET, "/api/admin/**").hasAnyRole(LEADERSHIP)
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/dashboard/stats").hasAnyRole(STAFF)

                        // --- students
                        .requestMatchers(HttpMethod.GET, "/api/students/parent/{parentAccountId}")
                            .access((a, c) -> new AuthorizationDecision(access.isOwnParentAccount(a.get(), c.getVariables().get("parentAccountId"))))
                        .requestMatchers(HttpMethod.GET, "/api/students/class/**").hasAnyRole(STAFF)
                        .requestMatchers(HttpMethod.GET, "/api/students/{id}").access(canReadStudent("id"))
                        .requestMatchers(HttpMethod.GET, "/api/students").hasAnyRole(STAFF)
                        .requestMatchers(HttpMethod.POST, "/api/students/by-ids").authenticated() // controller filters for parents
                        .requestMatchers(HttpMethod.PATCH, "/api/students/*/hall-ticket").hasAnyRole("TEACHER", "PRINCIPAL")
                        .requestMatchers("/api/students/**").hasRole("ADMIN")

                        // --- attendance & marks
                        .requestMatchers(HttpMethod.GET, "/api/attendance/student/{studentId}", "/api/attendance/summary/{studentId}").access(canReadStudent("studentId"))
                        .requestMatchers(HttpMethod.POST, "/api/attendance/mark").hasRole("TEACHER")
                        .requestMatchers("/api/attendance/**").hasAnyRole(STAFF)
                        .requestMatchers(HttpMethod.GET, "/api/marks/student/{studentId}").access(canReadStudent("studentId"))
                        // Teachers enter, verify and publish. The Principal approves cards but never publishes.
                        .requestMatchers(HttpMethod.POST, "/api/marks/entry").hasRole("TEACHER")
                        .requestMatchers(HttpMethod.PUT, "/api/marks/publish", "/api/marks/*/verify").hasRole("TEACHER")
                        .requestMatchers("/api/marks/**").hasAnyRole(STAFF)

                        // --- fees
                        .requestMatchers(HttpMethod.GET, "/api/fees/student/{studentId}").access(canReadStudent("studentId"))
                        .requestMatchers("/api/fees/**").hasAnyRole(LEADERSHIP)

                        // --- library & transport
                        .requestMatchers(HttpMethod.GET, "/api/library/student/{studentId}").access(canReadStudent("studentId"))
                        .requestMatchers(HttpMethod.GET, "/api/library/**").hasAnyRole(STAFF)
                        .requestMatchers("/api/library/**").hasAnyRole("ADMIN", "TEACHER")
                        .requestMatchers(HttpMethod.GET, "/api/transport/routes").authenticated()
                        .requestMatchers("/api/transport/**").hasRole("ADMIN")

                        // --- people & structure
                        .requestMatchers(HttpMethod.GET, "/api/parents/**", "/api/teachers/**").hasAnyRole(STAFF)
                        .requestMatchers("/api/parents/**", "/api/teachers/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/classes/**", "/api/timetable/**").authenticated()
                        .requestMatchers("/api/classes/**", "/api/timetable/**").hasRole("ADMIN")

                        // --- teaching content
                        .requestMatchers(HttpMethod.GET, "/api/homework/**", "/api/materials/**", "/api/quizzes/**", "/api/notices/**").authenticated()
                        .requestMatchers("/api/homework/**", "/api/materials/**", "/api/quizzes/**", "/api/notices/**").hasAnyRole(STAFF)

                        // --- communication
                        .requestMatchers(HttpMethod.GET, "/api/communication/calendar/**").authenticated()
                        .requestMatchers("/api/communication/calendar/**").hasAnyRole(LEADERSHIP)
                        .requestMatchers(HttpMethod.POST, "/api/communication/complaints").hasRole("PARENT")
                        .requestMatchers(HttpMethod.PATCH, "/api/communication/complaints/*/resolve").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/communication/complaints").hasAnyRole(LEADERSHIP)
                        .requestMatchers(HttpMethod.POST, "/api/communication/meetings").hasAnyRole("PARENT", "TEACHER")
                        .requestMatchers("/api/communication/meetings/**").hasAnyRole(STAFF)

                        // --- governance (Admin drafts/executes, Principal approves), corrections, office fee desk
                        .requestMatchers("/api/governance/**").hasAnyRole(LEADERSHIP)
                        .requestMatchers("/api/corrections/**").hasAnyRole("TEACHER", "PRINCIPAL")
                        .requestMatchers(HttpMethod.GET, "/api/owner/**").hasAnyRole(LEADERSHIP)
                        .requestMatchers("/api/office/**").hasRole("ADMIN")

                        // --- staff teaching tools: role here, relationship (Class/Subject Teacher) in the services
                        .requestMatchers("/api/staff/**").hasAnyRole(STAFF)

                        // --- parent app: always the session's own child (no student id in the URL)
                        .requestMatchers("/api/parent/**").hasRole("PARENT")

                        // --- everything else is denied until it has an explicit rule
                        .anyRequest().denyAll()
                )
                .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        List<String> origins = Arrays.asList(allowedOrigins.split(","));
        configuration.setAllowedOrigins(origins);
        configuration.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(Arrays.asList("Authorization", "Content-Type", "X-Requested-With", "Accept"));
        configuration.setAllowCredentials(true);
        configuration.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
