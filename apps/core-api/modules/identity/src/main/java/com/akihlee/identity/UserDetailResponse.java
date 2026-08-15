package com.akihlee.identity;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Full profile + forensics view for one user (see AdminUserController).
 *
 * lastKnownIp/lastKnownUserAgent come from that user's most recent
 * audit_log row — there's no IP geolocation lookup wired up (same gap as
 * the audit log page — see AuditDetailDrawer on the frontend) and no
 * device/hardware fingerprinting anywhere in this app, so "hardware" is
 * represented honestly as the raw User-Agent string, not a fabricated
 * device profile.
 */
public record UserDetailResponse(
        UUID id,
        UUID tenantId,
        String tenantBusinessName,
        String email,
        UserRole role,
        UserAccountStatus status,
        Instant registeredAt,
        String lastKnownIp,
        String lastKnownUserAgent,
        Instant lastLoginAt,
        Instant lastActiveAt,
        int totalSessions,
        Double avgSessionDurationMinutes,
        DocumentActivity documentActivity,
        List<WeekPoint> weeklyActivityTrend,
        List<IpHistoryEntry> ipHistory) {

    public record DocumentActivity(long uploaded, long approved, long rejected, long corrected) {
    }

    public record WeekPoint(String weekStart, long eventCount) {
    }

    public record IpHistoryEntry(Instant seenAt, String ipAddress, String userAgent, String action) {
    }
}
