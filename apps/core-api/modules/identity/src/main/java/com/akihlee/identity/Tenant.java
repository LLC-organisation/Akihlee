package com.akihlee.identity;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import java.time.Instant;
import java.util.UUID;

/**
 * Represents a business tenant in the system.
 * Each tenant is an isolated boundary for all financial data.
 */
@Entity
@Table(name = "tenants")
public class Tenant {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @NotBlank
    @Column(nullable = false)
    private String businessName;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant updatedAt;

    @Column(nullable = false)
    private boolean active = true;

    // Digits only (no "+"), matching WhatsApp Cloud API's wire format for
    // the "from" field, so incoming webhook messages can be matched directly.
    @Column(name = "whatsapp_phone_number", unique = true)
    private String whatsappPhoneNumber;

    protected Tenant() {
        // JPA requires a no-arg constructor
    }

    public Tenant(String businessName) {
        this.businessName = businessName;
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

    public String getBusinessName() {
        return businessName;
    }

    public void setBusinessName(String businessName) {
        this.businessName = businessName;
        this.updatedAt = Instant.now();
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public boolean isActive() {
        return active;
    }

    public void deactivate() {
        this.active = false;
        this.updatedAt = Instant.now();
    }

    public String getWhatsappPhoneNumber() {
        return whatsappPhoneNumber;
    }

    public void setWhatsappPhoneNumber(String whatsappPhoneNumber) {
        this.whatsappPhoneNumber = whatsappPhoneNumber;
        this.updatedAt = Instant.now();
    }
}
