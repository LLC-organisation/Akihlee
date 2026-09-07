package com.akihlee.identity;

import java.util.UUID;

public record MeResponse(UUID userId, String email, UUID tenantId, UserRole role, String businessName) {
}
