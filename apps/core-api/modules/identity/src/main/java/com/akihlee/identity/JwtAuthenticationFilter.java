package com.akihlee.identity;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

/**
 * Reads the "Authorization: Bearer <token>" header, and if valid, both
 * authenticates the request with Spring Security and sets TenantContext
 * for the duration of the request. This is what makes per-tenant data
 * isolation actually enforced end-to-end, rather than relying on the
 * client to say which tenant it is.
 */
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtService jwtService;
    private final UserActivityService userActivityService;

    public JwtAuthenticationFilter(JwtService jwtService, UserActivityService userActivityService) {
        this.jwtService = jwtService;
        this.userActivityService = userActivityService;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            try {
                Claims claims = jwtService.parseClaims(header.substring(7));
                UUID tenantId = UUID.fromString(claims.get("tenantId", String.class));
                TenantContext.setCurrentTenantId(tenantId);
                // Tokens issued before the role claim existed won't have one —
                // default to USER rather than reject them outright, so those
                // sessions just stay non-admin until they naturally expire.
                String role = claims.get("role", String.class);
                List<SimpleGrantedAuthority> authorities =
                        List.of(new SimpleGrantedAuthority(role != null ? role : UserRole.USER.name()));
                SecurityContextHolder.getContext().setAuthentication(
                        new UsernamePasswordAuthenticationToken(claims.getSubject(), null, authorities));
                // Best-effort presence signal for the admin User CRM's session
                // stats (see UserActivityService) — never blocks the request.
                userActivityService.recordPing(UUID.fromString(claims.getSubject()), tenantId);
            } catch (JwtException | IllegalArgumentException ignored) {
                // Leave the request unauthenticated; protected routes will reject it with 401.
            }
        }
        try {
            filterChain.doFilter(request, response);
        } finally {
            TenantContext.clear();
        }
    }
}
