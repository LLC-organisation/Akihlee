package com.akihlee.identity;

import java.util.UUID;

/**
 * Thread-local storage for the current tenant ID.
 * This is set by authentication/authorization layer and used throughout the request lifecycle.
 */
public class TenantContext {

    private static final ThreadLocal<UUID> currentTenantId = new ThreadLocal<>();

    public static void setCurrentTenantId(UUID tenantId) {
        currentTenantId.set(tenantId);
    }

    public static UUID getCurrentTenantId() {
        UUID tenantId = currentTenantId.get();
        if (tenantId == null) {
            throw new IllegalStateException("No tenant context set for current request");
        }
        return tenantId;
    }

    public static void clear() {
        currentTenantId.remove();
    }
}
