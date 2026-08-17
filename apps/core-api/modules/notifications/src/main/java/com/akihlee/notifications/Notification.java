package com.akihlee.notifications;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/**
 * A single in-app alert for one user (e.g. "OCR finished on receipt.pdf,
 * needs your review"). Per-user rather than per-tenant since read state and
 * delivery preferences are inherently per-user — a trigger that concerns a
 * whole tenant (e.g. a document finishing OCR) fans out one row per active
 * user in that tenant.
 */
@Entity
@Table(name = "notifications", indexes = {
    @Index(name = "idx_notifications_user_status", columnList = "user_id,status"),
    @Index(name = "idx_notifications_user_created", columnList = "user_id,created_at")
})
public class Notification {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(nullable = false, length = 1000)
    private String message;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private NotificationType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private NotificationStatus status = NotificationStatus.UNREAD;

    @Column(name = "document_id")
    private UUID documentId;

    // Free-form JSON (e.g. confidence, missing fields, merchant/amount) —
    // stored as TEXT and serialized by the caller, same convention as
    // ExtractedData.lineItemsJson in the documents module.
    @Column(columnDefinition = "TEXT")
    private String metadata;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    protected Notification() {
        // JPA requires a no-arg constructor
    }

    public Notification(
            UUID tenantId, UUID userId, String title, String message,
            NotificationType type, UUID documentId, String metadata) {
        this.tenantId = tenantId;
        this.userId = userId;
        this.title = title;
        this.message = message;
        this.type = type;
        this.documentId = documentId;
        this.metadata = metadata;
        this.createdAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getTitle() {
        return title;
    }

    public String getMessage() {
        return message;
    }

    public NotificationType getType() {
        return type;
    }

    public NotificationStatus getStatus() {
        return status;
    }

    public UUID getDocumentId() {
        return documentId;
    }

    public String getMetadata() {
        return metadata;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void markRead() {
        this.status = NotificationStatus.READ;
    }
}
