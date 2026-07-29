package com.akihlee.documents;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.UUID;

/**
 * Represents an uploaded financial document (receipt, invoice, statement).
 * Every document is scoped to a tenant for multi-tenancy isolation.
 */
@Entity
@Table(name = "documents", indexes = {
    @Index(name = "idx_documents_tenant_id", columnList = "tenant_id")
})
public class Document {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @NotNull
    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @NotBlank
    @Column(nullable = false)
    private String filename;

    @NotBlank
    @Column(nullable = false)
    private String storageKey;

    @Column(nullable = false)
    private String contentType;

    @Column(nullable = false)
    private Long sizeBytes;

    @Column(nullable = false)
    private String checksum;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private DocumentStatus status = DocumentStatus.UPLOADED;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant updatedAt;

    protected Document() {
        // JPA requires a no-arg constructor
    }

    public Document(UUID tenantId, String filename, String storageKey,
                    String contentType, Long sizeBytes, String checksum) {
        this.tenantId = tenantId;
        this.filename = filename;
        this.storageKey = storageKey;
        this.contentType = contentType;
        this.sizeBytes = sizeBytes;
        this.checksum = checksum;
        this.createdAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = Instant.now();
    }

    // Getters
    public UUID getId() {
        return id;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public String getFilename() {
        return filename;
    }

    public String getStorageKey() {
        return storageKey;
    }

    public String getContentType() {
        return contentType;
    }

    public Long getSizeBytes() {
        return sizeBytes;
    }

    public String getChecksum() {
        return checksum;
    }

    public DocumentStatus getStatus() {
        return status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void updateStatus(DocumentStatus newStatus) {
        this.status = newStatus;
        this.updatedAt = Instant.now();
    }

    public enum DocumentStatus {
        UPLOADED,
        PROCESSING,
        EXTRACTED,
        REVIEW_REQUIRED,
        APPROVED,
        REJECTED
    }
}
