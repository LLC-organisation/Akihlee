package com.akihlee.finance.aicfo;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

/**
 * One AI CFO chat thread, scoped to a single user (not the whole tenant) —
 * same reasoning as Notification: a chat history is personal, like an
 * inbox, so other users at the same business shouldn't see each other's
 * questions. tenant_id is still stored for cross-cutting queries/audit,
 * same convention as Notification.
 */
@Entity
@Table(name = "ai_cfo_conversations", indexes = {
        @Index(name = "idx_ai_cfo_conversations_user_updated", columnList = "user_id,updated_at")
})
public class AiCfoConversation {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant updatedAt;

    protected AiCfoConversation() {
        // JPA requires a no-arg constructor
    }

    public AiCfoConversation(UUID tenantId, UUID userId, String title) {
        this.tenantId = tenantId;
        this.userId = userId;
        this.title = title;
        this.createdAt = Instant.now();
        this.updatedAt = this.createdAt;
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

    public void setTitle(String title) {
        this.title = title;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    /** Bumped whenever a new message is appended, so the list sorts by recent activity. */
    public void touch() {
        this.updatedAt = Instant.now();
    }
}
