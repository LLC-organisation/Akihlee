package com.akihlee.identity;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final TenantContextFilter tenantContextFilter;
    private final SupabaseJwtAuthenticationConverter supabaseJwtAuthenticationConverter;
    private final List<String> allowedOrigins;
    private final String supabaseJwksUri;
    private final String supabaseIssuer;

    public SecurityConfig(
            TenantContextFilter tenantContextFilter,
            SupabaseJwtAuthenticationConverter supabaseJwtAuthenticationConverter,
            @Value("${cors.allowed-origins}") String allowedOrigins,
            @Value("${supabase.jwks-uri}") String supabaseJwksUri,
            @Value("${supabase.issuer}") String supabaseIssuer) {
        this.tenantContextFilter = tenantContextFilter;
        this.supabaseJwtAuthenticationConverter = supabaseJwtAuthenticationConverter;
        this.allowedOrigins = Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isEmpty())
                .toList();
        this.supabaseJwksUri = supabaseJwksUri;
        this.supabaseIssuer = supabaseIssuer;
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
                        // Authenticated via a shared internal key inside the controller
                        // itself, not a user JWT — the OCR worker has no user session.
                        .requestMatchers("/api/v1/internal/**").permitAll()
                        // Called directly by the inbound-email provider, which has no
                        // user JWT either; the webhook's own secret is its auth mechanism.
                        .requestMatchers("/api/v1/webhooks/**").permitAll()
                        // Square redirects the browser here after OAuth consent — a
                        // top-level navigation with no Authorization header. The
                        // signed `state` param (not a JWT) proves which tenant it
                        // belongs to; see SquareIntegrationController.oauthCallback.
                        .requestMatchers("/api/v1/integrations/square/oauth/callback").permitAll()
                        // Same reasoning as Square's callback above, for QuickBooks.
                        .requestMatchers("/api/v1/integrations/quickbooks/oauth/callback").permitAll()
                        // Audit log / admin tooling — gated on the "role" JWT claim
                        // (see SupabaseJwtAuthenticationConverter/ResolvedPrincipal), not
                        // just "any logged-in user".
                        .requestMatchers("/api/v1/admin/**").hasAuthority("ADMIN")
                        .anyRequest().authenticated())
                .oauth2ResourceServer(oauth2 -> oauth2.jwt(jwt -> jwt
                        .decoder(jwtDecoder())
                        .jwtAuthenticationConverter(supabaseJwtAuthenticationConverter)))
                .addFilterAfter(tenantContextFilter, BearerTokenAuthenticationFilter.class);
        return http.build();
    }

    /**
     * Verifies Supabase-issued access tokens against the project's published
     * JWKS (signature + expiry), plus an explicit issuer check — Supabase
     * owns credential/session management now, this app just trusts its
     * tokens (see SupabaseJwtAuthenticationConverter for what happens next).
     */
    @Bean
    public JwtDecoder jwtDecoder() {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(supabaseJwksUri).build();
        decoder.setJwtValidator(JwtValidators.createDefaultWithIssuer(supabaseIssuer));
        return decoder;
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(allowedOrigins);
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
