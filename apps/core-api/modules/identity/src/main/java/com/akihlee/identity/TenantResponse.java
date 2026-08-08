package com.akihlee.identity;

import java.util.UUID;

public record TenantResponse(
        UUID id,
        String businessName,
        String whatsappPhoneNumber,
        String inboundEmailAddress,
        boolean squareConnected) {

    public static TenantResponse from(Tenant tenant, String inboundEmailDomain) {
        return new TenantResponse(
                tenant.getId(),
                tenant.getBusinessName(),
                tenant.getWhatsappPhoneNumber(),
                tenant.getId() + "@" + inboundEmailDomain,
                tenant.isSquareConnected());
    }
}
