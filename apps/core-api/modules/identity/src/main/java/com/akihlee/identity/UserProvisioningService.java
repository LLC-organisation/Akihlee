package com.akihlee.identity;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.UUID;

/**
 * Resolves a verified Supabase JWT to this app's local User, auto-creating
 * the Tenant+User on first sight — Supabase owns the credential/email
 * identity, this app still owns tenant/role/business data, so there's no
 * separate "/register" endpoint anymore (see SupabaseJwtAuthenticationConverter).
 */
@Service
public class UserProvisioningService {

    private final UserRepository userRepository;
    private final TenantRepository tenantRepository;
    private final AuditLogService auditLogService;

    public UserProvisioningService(
            UserRepository userRepository, TenantRepository tenantRepository, AuditLogService auditLogService) {
        this.userRepository = userRepository;
        this.tenantRepository = tenantRepository;
        this.auditLogService = auditLogService;
    }

    /**
     * Never rejects a suspended user itself — it just reports what it found
     * (active=false included). TenantContextFilter is what actually blocks
     * the request, since it's the layer with the response to write to.
     */
    @Transactional
    public ResolvedPrincipal resolveOrProvision(Jwt jwt) {
        UUID supabaseUserId = UUID.fromString(jwt.getSubject());
        User user = userRepository.findBySupabaseUserId(supabaseUserId)
                .orElseGet(() -> provision(jwt, supabaseUserId));
        return new ResolvedPrincipal(user.getId(), user.getTenantId(), user.getRole(), user.isActive());
    }

    private User provision(Jwt jwt, UUID supabaseUserId) {
        try {
            String email = jwt.getClaimAsString("email");
            Tenant tenant = tenantRepository.save(new Tenant(businessNameFrom(jwt, email)));
            User user = userRepository.saveAndFlush(new User(tenant.getId(), email, supabaseUserId));
            auditLogService.log(tenant.getId(), user.getId(), user.getEmail(), AuditAction.REGISTER);
            return user;
        } catch (DataIntegrityViolationException raced) {
            // Two near-simultaneous first requests for the same new signup
            // both found no local row and both tried to insert — the loser
            // just re-reads what the winner created instead of failing.
            return userRepository.findBySupabaseUserId(supabaseUserId).orElseThrow(() -> raced);
        }
    }

    private static String businessNameFrom(Jwt jwt, String email) {
        Map<String, Object> userMetadata = jwt.getClaimAsMap("user_metadata");
        Object businessName = userMetadata != null ? userMetadata.get("businessName") : null;
        return businessName instanceof String s && !s.isBlank() ? s : email;
    }
}
