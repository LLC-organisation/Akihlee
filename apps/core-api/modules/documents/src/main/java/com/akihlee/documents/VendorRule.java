package com.akihlee.documents;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/**
 * A tenant's "always categorize X as Y" memory, created from the review UI
 * when a person corrects a bank transaction's category. Applied at
 * extraction-ingestion time (see ExtractedDataController.receiveExtraction)
 * to every future statement — a matched row is treated as if a human had
 * already categorized it (categoryConfidence 1.0), not as another AI guess.
 */
@Entity
@Table(name = "vendor_rules", indexes = {
        @Index(name = "idx_vendor_rules_tenant_id", columnList = "tenant_id")
})
public class VendorRule {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    // Matched as a case-insensitive substring against a transaction's
    // payeeOrPayer (falling back to description) — deliberately loose
    // rather than an exact match, since the same vendor rarely prints its
    // name identically across statement rows (e.g. "SYSCO FOODS INC" vs
    // "Sysco Foods #4471").
    @Column(name = "vendor_pattern", nullable = false)
    private String vendorPattern;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private BankTransaction.Type type;

    @Column(nullable = false)
    private String category;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    protected VendorRule() {
        // JPA requires a no-arg constructor
    }

    public VendorRule(UUID tenantId, String vendorPattern, BankTransaction.Type type, String category) {
        this.tenantId = tenantId;
        this.vendorPattern = vendorPattern;
        this.type = type;
        this.category = category;
        this.createdAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public String getVendorPattern() {
        return vendorPattern;
    }

    public BankTransaction.Type getType() {
        return type;
    }

    public String getCategory() {
        return category;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
