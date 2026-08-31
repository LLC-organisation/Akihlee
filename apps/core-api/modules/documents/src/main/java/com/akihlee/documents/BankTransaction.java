package com.akihlee.documents;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * A single transaction line parsed from a bank statement's ExtractedData
 * row. Stored as its own table (rather than embedded JSON, like line items)
 * since statements can run to dozens of transactions and each one is
 * independently editable.
 */
@Entity
@Table(name = "bank_transactions", indexes = {
    @Index(name = "idx_bank_transactions_extracted_data_id", columnList = "extracted_data_id"),
    @Index(name = "idx_bank_transactions_tenant_id", columnList = "tenant_id")
})
public class BankTransaction {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "extracted_data_id", nullable = false)
    private UUID extractedDataId;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "transaction_date", nullable = false)
    private LocalDate transactionDate;

    private String description;

    @Column(name = "payee_or_payer")
    private String payeeOrPayer;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Type type;

    private String category;

    // How confident the extraction engine was in `category` (0-1), or null
    // for rows predating this field. A human editing the row (create/update
    // through BankTransactionController) always sets this to 1.0 — once a
    // person has touched a row, it's verified regardless of what the AI
    // originally guessed. See ExtractionMethodBadge-style green/amber UI
    // treatment on the frontend for how this gets surfaced.
    @Column(name = "category_confidence")
    private Double categoryConfidence;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    protected BankTransaction() {
        // JPA requires a no-arg constructor
    }

    public BankTransaction(UUID extractedDataId, UUID tenantId, LocalDate transactionDate,
                            String description, String payeeOrPayer, BigDecimal amount,
                            Type type, String category, Double categoryConfidence) {
        this.extractedDataId = extractedDataId;
        this.tenantId = tenantId;
        this.transactionDate = transactionDate;
        this.description = description;
        this.payeeOrPayer = payeeOrPayer;
        this.amount = amount;
        this.type = type;
        this.category = category;
        this.categoryConfidence = categoryConfidence;
        this.createdAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public UUID getExtractedDataId() {
        return extractedDataId;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public LocalDate getTransactionDate() {
        return transactionDate;
    }

    public void setTransactionDate(LocalDate transactionDate) {
        this.transactionDate = transactionDate;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getPayeeOrPayer() {
        return payeeOrPayer;
    }

    public void setPayeeOrPayer(String payeeOrPayer) {
        this.payeeOrPayer = payeeOrPayer;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }

    public Type getType() {
        return type;
    }

    public void setType(Type type) {
        this.type = type;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public Double getCategoryConfidence() {
        return categoryConfidence;
    }

    public void setCategoryConfidence(Double categoryConfidence) {
        this.categoryConfidence = categoryConfidence;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public enum Type {
        INCOME,
        EXPENSE,
        TRANSFER
    }
}
