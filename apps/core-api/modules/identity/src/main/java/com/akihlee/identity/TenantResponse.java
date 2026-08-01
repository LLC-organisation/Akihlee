package com.akihlee.identity;

import java.util.UUID;

public record TenantResponse(UUID id, String businessName, String whatsappPhoneNumber) {

    public static TenantResponse from(Tenant tenant) {
        return new TenantResponse(tenant.getId(), tenant.getBusinessName(), tenant.getWhatsappPhoneNumber());
    }
}
