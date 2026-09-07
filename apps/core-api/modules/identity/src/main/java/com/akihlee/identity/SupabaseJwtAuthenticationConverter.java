package com.akihlee.identity;

import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Resolves a verified Supabase JWT (signature/expiry/issuer already checked
 * by Spring's NimbusJwtDecoder — see SecurityConfig) to this app's own
 * User/Tenant model. The principal stays the local user's UUID string, not
 * Supabase's own subject, so everything already keyed off
 * SecurityContextHolder...getName() (AdminUserController.currentAdminId(),
 * AuditLogService, TenantContextFilter) keeps working unchanged.
 */
@Component
public class SupabaseJwtAuthenticationConverter implements Converter<Jwt, AbstractAuthenticationToken> {

    private final UserProvisioningService userProvisioningService;

    public SupabaseJwtAuthenticationConverter(UserProvisioningService userProvisioningService) {
        this.userProvisioningService = userProvisioningService;
    }

    @Override
    public AbstractAuthenticationToken convert(Jwt jwt) {
        ResolvedPrincipal resolved = userProvisioningService.resolveOrProvision(jwt);
        List<SimpleGrantedAuthority> authorities = List.of(new SimpleGrantedAuthority(resolved.role().name()));
        UsernamePasswordAuthenticationToken token =
                new UsernamePasswordAuthenticationToken(resolved.userId().toString(), null, authorities);
        token.setDetails(resolved);
        return token;
    }
}
