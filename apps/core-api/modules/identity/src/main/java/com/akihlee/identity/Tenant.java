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

    // Populated once this tenant completes Square's OAuth flow (see
    // SquareOAuthService) — null means "not connected via OAuth", in which
    // case SquareSyncService falls back to the operator's own
    // SQUARE_ACCESS_TOKEN env var, if configured.
    @Column(name = "square_access_token", columnDefinition = "TEXT")
    private String squareAccessToken;

    @Column(name = "square_refresh_token", columnDefinition = "TEXT")
    private String squareRefreshToken;

    @Column(name = "square_merchant_id")
    private String squareMerchantId;

    @Column(name = "square_token_expires_at")
    private Instant squareTokenExpiresAt;

    // Populated once this tenant completes QuickBooks' OAuth flow (see
    // QuickBooksOAuthService) — null means "not connected." Unlike Square,
    // there's no operator-fallback token: QuickBooks is OAuth-only, so every
    // tenant must connect their own company.
    //
    // @Convert'd (unlike the Square tokens above) — Intuit's App Store
    // security review requires QuickBooks access/refresh tokens encrypted
    // at rest; see AesGcmStringConverter.
    @Column(name = "quickbooks_access_token", columnDefinition = "TEXT")
    @Convert(converter = AesGcmStringConverter.class)
    private String quickbooksAccessToken;

    @Column(name = "quickbooks_refresh_token", columnDefinition = "TEXT")
    @Convert(converter = AesGcmStringConverter.class)
    private String quickbooksRefreshToken;

    @Column(name = "quickbooks_realm_id")
    private String quickbooksRealmId;

    @Column(name = "quickbooks_token_expires_at")
    private Instant quickbooksTokenExpiresAt;

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

    public boolean isSquareConnected() {
        return squareAccessToken != null;
    }

    public String getSquareAccessToken() {
        return squareAccessToken;
    }

    public String getSquareRefreshToken() {
        return squareRefreshToken;
    }

    public String getSquareMerchantId() {
        return squareMerchantId;
    }

    public Instant getSquareTokenExpiresAt() {
        return squareTokenExpiresAt;
    }

    public void connectSquare(String accessToken, String refreshToken, String merchantId, Instant expiresAt) {
        this.squareAccessToken = accessToken;
        this.squareRefreshToken = refreshToken;
        this.squareMerchantId = merchantId;
        this.squareTokenExpiresAt = expiresAt;
        this.updatedAt = Instant.now();
    }

    public void disconnectSquare() {
        this.squareAccessToken = null;
        this.squareRefreshToken = null;
        this.squareMerchantId = null;
        this.squareTokenExpiresAt = null;
        this.updatedAt = Instant.now();
    }

    public boolean isQuickbooksConnected() {
        return quickbooksAccessToken != null;
    }

    public String getQuickbooksAccessToken() {
        return quickbooksAccessToken;
    }

    public String getQuickbooksRefreshToken() {
        return quickbooksRefreshToken;
    }

    public String getQuickbooksRealmId() {
        return quickbooksRealmId;
    }

    public Instant getQuickbooksTokenExpiresAt() {
        return quickbooksTokenExpiresAt;
    }

    public void connectQuickbooks(String accessToken, String refreshToken, String realmId, Instant expiresAt) {
        this.quickbooksAccessToken = accessToken;
        this.quickbooksRefreshToken = refreshToken;
        this.quickbooksRealmId = realmId;
        this.quickbooksTokenExpiresAt = expiresAt;
        this.updatedAt = Instant.now();
    }

    public void disconnectQuickbooks() {
        this.quickbooksAccessToken = null;
        this.quickbooksRefreshToken = null;
        this.quickbooksRealmId = null;
        this.quickbooksTokenExpiresAt = null;
        this.updatedAt = Instant.now();
    }
}
