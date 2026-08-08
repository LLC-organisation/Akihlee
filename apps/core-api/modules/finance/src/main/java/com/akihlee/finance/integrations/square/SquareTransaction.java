package com.akihlee.finance.integrations.square;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Represents a transaction imported from Square.
 * Square handles payments, refunds, and other financial transactions for SMEs.
 */
@Entity
@Table(name = "square_transactions", indexes = {
    @Index(name = "idx_square_tx_tenant_id", columnList = "tenant_id"),
    @Index(name = "idx_square_tx_external_id", columnList = "external_id", unique = true)
})
public class SquareTransaction {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @NotNull
    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    /**
     * Square's transaction ID - used for idempotency.
     */
    @NotBlank
    @Column(name = "external_id", nullable = false, unique = true)
    private String externalId;

    @NotNull
    @Column(nullable = false, precision = 19, scale = 4)
    private BigDecimal amount;

    @NotBlank
    @Column(nullable = false, length = 3)
    private String currency;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TransactionType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TransactionStatus status;

    /**
     * Square location ID (businesses can have multiple locations).
     */
    private String locationId;

    /**
     * Customer description or note.
     */
    @Column(length = 500)
    private String description;

    /**
     * The reviewable Document (+ ExtractedData) this payment was bridged
     * into, once imported. Null only transiently between the transaction
     * save and the bridge step within the same sync transaction.
     */
    @Column(name = "document_id")
    private UUID documentId;

    /**
     * When the transaction occurred in Square.
     */
    @Column(nullable = false)
    private Instant transactionDate;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant updatedAt;

    /**
     * Whether this transaction has been reconciled with ledger.
     */
    @Column(nullable = false)
    private boolean reconciled = false;

    protected SquareTransaction() {
        // JPA requires a no-arg constructor
    }

    public SquareTransaction(UUID tenantId, String externalId, BigDecimal amount,
                             String currency, TransactionType type, TransactionStatus status,
                             Instant transactionDate) {
        this.tenantId = tenantId;
        this.externalId = externalId;
        this.amount = amount;
        this.currency = currency;
        this.type = type;
        this.status = status;
        this.transactionDate = transactionDate;
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

    public String getExternalId() {
        return externalId;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public String getCurrency() {
        return currency;
    }

    public TransactionType getType() {
        return type;
    }

    public TransactionStatus getStatus() {
        return status;
    }

    public String getLocationId() {
        return locationId;
    }

    public String getDescription() {
        return description;
    }

    public UUID getDocumentId() {
        return documentId;
    }

    public Instant getTransactionDate() {
        return transactionDate;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public boolean isReconciled() {
        return reconciled;
    }

    // Setters for optional fields
    public void setLocationId(String locationId) {
        this.locationId = locationId;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public void setDocumentId(UUID documentId) {
        this.documentId = documentId;
    }

    public void markAsReconciled() {
        this.reconciled = true;
        this.updatedAt = Instant.now();
    }

    public enum TransactionType {
        PAYMENT,
        REFUND,
        ADJUSTMENT,
        FEE
    }

    public enum TransactionStatus {
        COMPLETED,
        PENDING,
        FAILED,
        CANCELED
    }
}
