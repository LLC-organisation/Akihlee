package com.akihlee.identity;

import java.util.UUID;

public record TenantResponse(
        UUID id,
        String businessName,
        String inboundEmailAddress,
        boolean squareConnected,
        boolean quickbooksConnected) {

    public static TenantResponse from(Tenant tenant, String inboundEmailDomain) {
        return new TenantResponse(
                tenant.getId(),
                tenant.getBusinessName(),
                tenant.getId() + "@" + inboundEmailDomain,
                tenant.isSquareConnected(),
                tenant.isQuickbooksConnected());
    }
}
