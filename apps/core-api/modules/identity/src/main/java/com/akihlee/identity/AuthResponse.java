package com.akihlee.identity;

import java.util.UUID;

public record AuthResponse(String token, UUID tenantId, String email, String businessName) {
}
