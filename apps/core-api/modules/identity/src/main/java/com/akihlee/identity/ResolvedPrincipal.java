package com.akihlee.identity;

import java.util.UUID;

/**
 * What a verified Supabase JWT resolves to in this app's own User/Tenant
 * model (see UserProvisioningService). Carried as the Authentication's
 * details (not principal — see SupabaseJwtAuthenticationConverter) so
 * TenantContextFilter can read it without an extra DB query.
 */
public record ResolvedPrincipal(UUID userId, UUID tenantId, UserRole role, boolean active) {
}
