package com.akihlee.identity;

import java.util.List;
import java.util.UUID;

/**
 * KPI header for the admin User CRM directory (see AdminUserController) —
 * scoped to whatever search/tenant/role filters the caller applied, so the
 * numbers match what's actually in the table below them.
 */
public record UserSummaryResponse(
        long dailyActiveUsers,
        long monthlyActiveUsers,
        Double avgSessionDurationMinutes,
        List<PowerUser> topPowerUsers,
        long atRiskUsers,
        long totalUsers) {

    public record PowerUser(UUID id, String email, String tenantBusinessName, long documentsProcessedTotal) {
    }
}
