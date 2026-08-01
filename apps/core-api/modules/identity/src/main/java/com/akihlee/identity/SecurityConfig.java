package com.akihlee.identity;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                // Without an explicit entry point, Spring Security has no login form/realm
                // to fall back on for a stateless JWT API and defaults to 403 for missing/
                // invalid credentials — indistinguishable from a real authorization failure,
                // and it stops the frontend's "401 -> redirect to login" logic from firing
                // on an expired token. Force the standard 401 instead.
                .exceptionHandling(ex -> ex.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
                .authorizeHttpRequests(auth -> auth
                        // Spring MVC internally forwards to /error to render any thrown
                        // exception (400s, 409s, etc.) as a response. Without this, Security
                        // blocks that forward and every error response silently becomes a
                        // blank 403 regardless of the real status the controller intended.
                        .requestMatchers("/error").permitAll()
                        // Only these two are public; other /api/v1/auth/** endpoints
                        // (e.g. change-password) require a valid JWT by default below.
                        .requestMatchers("/api/v1/auth/register", "/api/v1/auth/login").permitAll()
                        // Authenticated via a shared internal key inside the controller
                        // itself, not a user JWT — the OCR worker has no user session.
                        .requestMatchers("/api/v1/internal/**").permitAll()
                        // Called directly by Meta/WhatsApp, which has no user JWT either;
                        // the verify-token handshake is its own auth mechanism.
                        .requestMatchers("/api/v1/webhooks/**").permitAll()
                        .anyRequest().authenticated())
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(List.of("http://localhost:3000"));
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
