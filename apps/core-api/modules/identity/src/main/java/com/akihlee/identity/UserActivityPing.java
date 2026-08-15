package com.akihlee.identity;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

/**
 * A single "this user made an authenticated request around this time"
 * marker — see UserActivityService for how these get written (throttled,
 * best-effort) and reconstructed into approximate session durations
 * (gap-based bucketing, since there's no real session start/end event in
 * a stateless-JWT app).
 */
@Entity
@Table(name = "user_activity_pings")
public class UserActivityPing {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected UserActivityPing() {
        // JPA requires a no-arg constructor
    }

    public UserActivityPing(UUID userId, UUID tenantId) {
        this.userId = userId;
        this.tenantId = tenantId;
        this.createdAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
