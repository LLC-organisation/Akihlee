package com.akihlee.identity;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

/**
 * Immutable trail of security- and troubleshooting-relevant events (logins,
 * password changes, document uploads/status changes, WhatsApp
 * connect/disconnect) for admin-only review — day-to-day "why did this fail
 * for this user" support, and, for security incidents, a non-repudiation
 * timeline of who did what, when, and from where.
 *
 * Deliberately denormalizes actorEmail/tenantBusinessName at write time
 * rather than joining to users/tenants at read time — an audit trail should
 * reflect what was true when the event happened, not be silently rewritten
 * if the user's email later changes or the account is deleted.
 */
@Entity
@Table(name = "audit_log")
public class AuditLogEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id")
    private UUID tenantId;

    @Column(name = "tenant_business_name", length = 255)
    private String tenantBusinessName;

    @Column(name = "actor_user_id")
    private UUID actorUserId;

    @Column(name = "actor_email", length = 255)
    private String actorEmail;

    @Column(nullable = false, length = 100)
    private String action;

    @Column(name = "entity_type", length = 50)
    private String entityType;

    @Column(name = "entity_id", length = 100)
    private String entityId;

    @Column(name = "ip_address", length = 64)
    private String ipAddress;

    @Column(name = "user_agent", length = 512)
    private String userAgent;

    @Column(length = 1000)
    private String detail;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected AuditLogEntry() {
        // JPA requires a no-arg constructor
    }

    public AuditLogEntry(
            UUID tenantId, String tenantBusinessName, UUID actorUserId, String actorEmail,
            String action, String entityType, String entityId,
            String ipAddress, String userAgent, String detail) {
        this.tenantId = tenantId;
        this.tenantBusinessName = tenantBusinessName;
        this.actorUserId = actorUserId;
        this.actorEmail = actorEmail;
        this.action = action;
        this.entityType = entityType;
        this.entityId = entityId;
        this.ipAddress = ipAddress;
        this.userAgent = userAgent;
        this.detail = detail;
        this.createdAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public String getTenantBusinessName() {
        return tenantBusinessName;
    }

    public UUID getActorUserId() {
        return actorUserId;
    }

    public String getActorEmail() {
        return actorEmail;
    }

    public String getAction() {
        return action;
    }

    public String getEntityType() {
        return entityType;
    }

    public String getEntityId() {
        return entityId;
    }

    public String getIpAddress() {
        return ipAddress;
    }

    public String getUserAgent() {
        return userAgent;
    }

    public String getDetail() {
        return detail;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
