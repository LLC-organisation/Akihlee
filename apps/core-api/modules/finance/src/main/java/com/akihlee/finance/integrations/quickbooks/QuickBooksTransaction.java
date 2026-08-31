package com.akihlee.finance.integrations.quickbooks;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * A Purchase (expense) transaction imported from QuickBooks. Every row
 * here is the same kind of thing — QuickBooks Purchases are always an
 * expense — unlike SquareTransaction, which models several distinct
 * payment/refund/fee types, so there's no type/status enum here.
 */
@Entity
@Table(name = "quickbooks_transactions", indexes = {
    @Index(name = "idx_quickbooks_tx_tenant_id", columnList = "tenant_id"),
    @Index(name = "idx_quickbooks_tx_external_id", columnList = "external_id", unique = true)
})
public class QuickBooksTransaction {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @NotNull
    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    /** QuickBooks' Purchase Id — used for idempotency. */
    @NotBlank
    @Column(name = "external_id", nullable = false, unique = true)
    private String externalId;

    @NotNull
    @Column(nullable = false, precision = 19, scale = 4)
    private BigDecimal amount;

    @NotBlank
    @Column(nullable = false, length = 3)
    private String currency;

    /** The QuickBooks expense account name (AccountRef.name) — used as our category. */
    @Column(name = "account_name")
    private String accountName;

    /** The vendor/payee name (EntityRef.name). */
    @Column(name = "payee_name")
    private String payeeName;

    @Column(length = 500)
    private String description;

    /**
     * The reviewable Document (+ ExtractedData/BankTransaction) this
     * purchase was bridged into, once imported. Null only transiently
     * between the transaction save and the bridge step within the same
     * sync transaction.
     */
    @Column(name = "document_id")
    private UUID documentId;

    /** When the transaction occurred in QuickBooks. */
    @Column(nullable = false)
    private Instant transactionDate;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant updatedAt;

    @Column(nullable = false)
    private boolean reconciled = false;

    protected QuickBooksTransaction() {
        // JPA requires a no-arg constructor
    }

    public QuickBooksTransaction(UUID tenantId, String externalId, BigDecimal amount, String currency,
                                  String accountName, String payeeName, Instant transactionDate) {
        this.tenantId = tenantId;
        this.externalId = externalId;
        this.amount = amount;
        this.currency = currency;
        this.accountName = accountName;
        this.payeeName = payeeName;
        this.transactionDate = transactionDate;
        this.createdAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = Instant.now();
    }

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

    public String getAccountName() {
        return accountName;
    }

    public String getPayeeName() {
        return payeeName;
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
}
