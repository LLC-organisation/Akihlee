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

    // "REDACTING" | "EXTRACTING" | null — a finer-grained progress signal
    // document-worker reports while status is still PROCESSING, so the
    // frontend can show "Redacting personal information..." instead of a
    // static "still processing" message. Plain String, not a Java enum,
    // matching ExtractedData.extractionMethod's precedent for worker-
    // reported values: the set of stages is owned by document-worker, not
    // this codebase, so a strict enum would just be one more place to keep
    // in sync across two languages for no real benefit. Always null once
    // status leaves PROCESSING — see ExtractedDataController.receiveExtraction.
    @Column(name = "processing_stage")
    private String processingStage;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private DocumentSource source;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant updatedAt;

    protected Document() {
        // JPA requires a no-arg constructor
    }

    public Document(UUID tenantId, String filename, String storageKey,
                    String contentType, Long sizeBytes, String checksum, DocumentSource source) {
        this.tenantId = tenantId;
        this.filename = filename;
        this.storageKey = storageKey;
        this.contentType = contentType;
        this.sizeBytes = sizeBytes;
        this.checksum = checksum;
        this.source = source;
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

    public String getProcessingStage() {
        return processingStage;
    }

    public void setProcessingStage(String processingStage) {
        this.processingStage = processingStage;
    }

    public DocumentSource getSource() {
        return source;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void updateStatus(DocumentStatus newStatus) {
        this.status = newStatus;
        // Only meaningful mid-PROCESSING — always cleared once status
        // moves on, rather than trusting every call site to remember to.
        if (newStatus != DocumentStatus.PROCESSING) {
            this.processingStage = null;
        }
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

    public enum DocumentSource {
        UPLOAD,
        EMAIL,
        WHATSAPP,
        SQUARE,
        QUICKBOOKS
    }
}
