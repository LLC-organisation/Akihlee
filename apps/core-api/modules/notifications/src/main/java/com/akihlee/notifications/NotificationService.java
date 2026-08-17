package com.akihlee.notifications;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

/**
 * Central entry point for raising a notification. Persists the in-app
 * record unconditionally (so the Notification Center is always a complete
 * record of what happened), then dispatches to other channels (email,
 * real-time push — added in later phases) only when the user's preferences
 * allow it. Mirrors AuditLogService's rule: a delivery failure must never
 * break the action that triggered the notification, so dispatch is wrapped
 * in try/catch and only logged.
 */
@Service
public class NotificationService {

    private static final Logger logger = LoggerFactory.getLogger(NotificationService.class);

    private final NotificationRepository notificationRepository;
    private final NotificationPreferenceRepository preferenceRepository;

    public NotificationService(
            NotificationRepository notificationRepository,
            NotificationPreferenceRepository preferenceRepository) {
        this.notificationRepository = notificationRepository;
        this.preferenceRepository = preferenceRepository;
    }

    public Notification createNotification(
            UUID tenantId, UUID userId, String title, String message,
            NotificationType type, UUID documentId, String metadataJson) {
        Notification notification = new Notification(tenantId, userId, title, message, type, documentId, metadataJson);
        notificationRepository.save(notification);

        try {
            dispatch(notification, preferencesFor(userId));
        } catch (Exception e) {
            logger.warn("Failed to dispatch notification {} to user {}", notification.getId(), userId, e);
        }

        return notification;
    }

    /**
     * Delivery hook for later phases (email in Phase 3, real-time broadcast
     * in Phase 2) — in-app storage above is unconditional and already done
     * by the time this runs, so a no-op here still leaves a complete
     * Notification Center record.
     */
    private void dispatch(Notification notification, NotificationPreference preference) {
        // Intentionally empty until Phase 2 (real-time) / Phase 3 (email)
        // wire in EmailService / RealtimeBroadcastService here, each gated
        // on preference.isEmailEnabled() / preference.isInAppEnabled().
    }

    public List<Notification> list(UUID userId, String statusFilter, int limit) {
        Pageable page = PageRequest.of(0, limit, Sort.by(Sort.Direction.DESC, "createdAt"));
        return switch (statusFilter) {
            case "UNREAD" -> notificationRepository.findByUserIdAndStatusOrderByCreatedAtDesc(userId, NotificationStatus.UNREAD, page);
            case "ACTION_REQUIRED" -> notificationRepository.findByUserIdAndTypeOrderByCreatedAtDesc(userId, NotificationType.ACTION_REQUIRED, page);
            default -> notificationRepository.findByUserIdOrderByCreatedAtDesc(userId, page);
        };
    }

    public long unreadCount(UUID userId) {
        return notificationRepository.countByUserIdAndStatus(userId, NotificationStatus.UNREAD);
    }

    public boolean markRead(UUID id, UUID userId) {
        return notificationRepository.findByIdAndUserId(id, userId)
                .map(n -> {
                    n.markRead();
                    notificationRepository.save(n);
                    return true;
                })
                .orElse(false);
    }

    public void markAllRead(UUID userId) {
        notificationRepository.markAllRead(userId);
    }

    public NotificationPreference preferencesFor(UUID userId) {
        return preferenceRepository.findByUserId(userId)
                .orElseGet(() -> preferenceRepository.save(new NotificationPreference(userId)));
    }

    public NotificationPreference updatePreferences(
            UUID userId, boolean emailEnabled, boolean batchDigestEnabled, boolean inAppEnabled) {
        NotificationPreference preference = preferencesFor(userId);
        preference.setEmailEnabled(emailEnabled);
        preference.setBatchDigestEnabled(batchDigestEnabled);
        preference.setInAppEnabled(inAppEnabled);
        return preferenceRepository.save(preference);
    }
}
