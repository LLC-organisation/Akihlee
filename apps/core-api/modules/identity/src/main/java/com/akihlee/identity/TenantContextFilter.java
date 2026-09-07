package com.akihlee.identity;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Runs after Spring's own resource-server filter has verified the Supabase
 * JWT and resolved it to a local user (see SupabaseJwtAuthenticationConverter
 * / ResolvedPrincipal, carried as the Authentication's details). Enforces
 * suspension — the only place left to check it, since login no longer goes
 * through core-api — and sets TenantContext for the duration of the
 * request, which is what makes per-tenant data isolation actually enforced
 * end-to-end rather than relying on the client to say which tenant it is.
 */
@Component
public class TenantContextFilter extends OncePerRequestFilter {

    private final UserActivityService userActivityService;

    public TenantContextFilter(UserActivityService userActivityService) {
        this.userActivityService = userActivityService;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getDetails() instanceof ResolvedPrincipal resolved) {
            if (!resolved.active()) {
                SecurityContextHolder.clearContext();
                response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                response.setContentType("application/json");
                response.getWriter().write("{\"error\":\"This account has been suspended\"}");
                return;
            }
            TenantContext.setCurrentTenantId(resolved.tenantId());
            userActivityService.recordPing(resolved.userId(), resolved.tenantId());
        }
        try {
            filterChain.doFilter(request, response);
        } finally {
            TenantContext.clear();
        }
    }
}
