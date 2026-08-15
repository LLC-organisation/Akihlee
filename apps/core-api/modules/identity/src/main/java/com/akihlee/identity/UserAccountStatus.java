package com.akihlee.identity;

import java.time.Duration;
import java.time.Instant;

/**
 * Admin-facing status bucket for the User CRM (see AdminUserController).
 * SUSPENDED is the one real on/off switch (User.active); ACTIVE/IDLE/
 * AT_RISK are just recency bands over lastActiveAt, not stored anywhere.
 */
public enum UserAccountStatus {
    ACTIVE,
    IDLE,
    AT_RISK,
    SUSPENDED;

    private static final Duration IDLE_THRESHOLD = Duration.ofDays(7);
    private static final Duration AT_RISK_THRESHOLD = Duration.ofDays(14);

    public static UserAccountStatus of(boolean active, Instant lastActiveAt, Instant now) {
        if (!active) {
            return SUSPENDED;
        }
        if (lastActiveAt == null) {
            return AT_RISK;
        }
        Duration sinceActive = Duration.between(lastActiveAt, now);
        if (sinceActive.compareTo(IDLE_THRESHOLD) <= 0) {
            return ACTIVE;
        }
        if (sinceActive.compareTo(AT_RISK_THRESHOLD) <= 0) {
            return IDLE;
        }
        return AT_RISK;
    }
}
