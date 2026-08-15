package com.akihlee.identity;

import java.util.UUID;

/**
 * Minimal tenant projection for admin tooling (e.g. the audit log's tenant
 * picker) — deliberately excludes WhatsApp/Square credentials that
 * TenantResponse carries, since this is a pick-a-tenant-by-name/id search,
 * not a tenant settings view.
 */
public record AdminTenantSummary(UUID id, String businessName) {

    public static AdminTenantSummary from(Tenant tenant) {
        return new AdminTenantSummary(tenant.getId(), tenant.getBusinessName());
    }
}
