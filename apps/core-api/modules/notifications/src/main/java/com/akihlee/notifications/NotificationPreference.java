package com.akihlee.notifications;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;

/**
 * Per-user delivery settings. Every user gets a default row lazily (see
 * NotificationService.preferencesFor) rather than one being created at
 * signup, so existing users don't need a backfill migration.
 */
@Entity
@Table(name = "notification_preferences")
public class NotificationPreference {

    @Id
    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "email_enabled", nullable = false)
    private boolean emailEnabled = true;

    @Column(name = "batch_digest_enabled", nullable = false)
    private boolean batchDigestEnabled = true;

    @Column(name = "in_app_enabled", nullable = false)
    private boolean inAppEnabled = true;

    protected NotificationPreference() {
        // JPA requires a no-arg constructor
    }

    public NotificationPreference(UUID userId) {
        this.userId = userId;
    }

    public UUID getUserId() {
        return userId;
    }

    public boolean isEmailEnabled() {
        return emailEnabled;
    }

    public void setEmailEnabled(boolean emailEnabled) {
        this.emailEnabled = emailEnabled;
    }

    public boolean isBatchDigestEnabled() {
        return batchDigestEnabled;
    }

    public void setBatchDigestEnabled(boolean batchDigestEnabled) {
        this.batchDigestEnabled = batchDigestEnabled;
    }

    public boolean isInAppEnabled() {
        return inAppEnabled;
    }

    public void setInAppEnabled(boolean inAppEnabled) {
        this.inAppEnabled = inAppEnabled;
    }
}
