package com.akihlee.identity;

import java.time.Instant;
import java.util.UUID;

/**
 * One row of the admin User CRM directory table. There's no separate
 * "name" field anywhere in this schema (User only has email) — the
 * frontend derives a display label from the email itself.
 */
public record UserDirectoryEntry(
        UUID id,
        UUID tenantId,
        String tenantBusinessName,
        String email,
        UserRole role,
        UserAccountStatus status,
        Instant registeredAt,
        Instant lastLoginAt,
        Instant lastActiveAt,
        int totalSessions,
        Double avgSessionDurationMinutes,
        long documentsUploaded,
        long documentsApproved,
        long documentsRejected,
        long documentsProcessedTotal) {
}
