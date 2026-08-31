package com.akihlee.finance.integrations.quickbooks;

import com.akihlee.documents.BankTransaction;
import com.akihlee.documents.Document;
import com.akihlee.documents.DocumentService;
import com.akihlee.documents.ExternalDataSeed;
import com.akihlee.identity.Tenant;
import com.akihlee.identity.TenantContext;
import com.akihlee.identity.TenantRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

/**
 * Service for syncing QuickBooks Purchase (expense) transactions to the
 * local database. Implements idempotent import to prevent duplicates.
 */
@Service
public class QuickBooksSyncService {

    private static final Logger logger = LoggerFactory.getLogger(QuickBooksSyncService.class);

    private final QuickBooksApiClient quickBooksApiClient;
    private final QuickBooksTransactionRepository transactionRepository;
    private final DocumentService documentService;
    private final TenantRepository tenantRepository;
    private final QuickBooksOAuthService quickBooksOAuthService;
    private final String environment;

    public QuickBooksSyncService(QuickBooksApiClient quickBooksApiClient,
                                 QuickBooksTransactionRepository transactionRepository,
                                 DocumentService documentService,
                                 TenantRepository tenantRepository,
                                 QuickBooksOAuthService quickBooksOAuthService,
                                 @Value("${quickbooks.environment:sandbox}") String environment) {
        this.quickBooksApiClient = quickBooksApiClient;
        this.transactionRepository = transactionRepository;
        this.documentService = documentService;
        this.tenantRepository = tenantRepository;
        this.quickBooksOAuthService = quickBooksOAuthService;
        this.environment = environment;
    }

    /**
     * Sync QuickBooks purchases for the current tenant within a date
     * range. Idempotent — duplicate transactions are skipped based on
     * external ID.
     */
    @Transactional
    public int syncTransactions(Instant startDate, Instant endDate) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        logger.info("Syncing QuickBooks transactions for tenant {} from {} to {}", tenantId, startDate, endDate);

        QuickBooksCredentials credentials = resolveCredentials(tenantId);
        List<QuickBooksPurchase> purchases = quickBooksApiClient.fetchPurchases(
                credentials.accessToken(), credentials.realmId(), credentials.environment(), startDate, endDate);

        int importedCount = 0;
        for (QuickBooksPurchase purchase : purchases) {
            if (importTransaction(tenantId, purchase)) {
                importedCount++;
            }
        }

        logger.info("Imported {} new QuickBooks transactions for tenant {}", importedCount, tenantId);
        return importedCount;
    }

    /** QuickBooks is OAuth-only — no operator fallback token the way Square has one. */
    private QuickBooksCredentials resolveCredentials(UUID tenantId) {
        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new IllegalStateException("Tenant not found: " + tenantId));

        if (!tenant.isQuickbooksConnected()) {
            throw new QuickBooksNotConfiguredException(
                    "QuickBooks isn't connected for this account. Connect it from the Integrations page.");
        }

        refreshIfNeeded(tenant);
        return new QuickBooksCredentials(tenant.getQuickbooksAccessToken(), tenant.getQuickbooksRealmId(), environment);
    }

    /**
     * Proactively refreshes a tenant's QuickBooks token if it's expired or
     * expiring soon. QuickBooks rotates the refresh token on every use —
     * connectQuickbooks persists the NEW refresh token
     * QuickBooksOAuthService returns, not the one that was just spent (see
     * QuickBooksOAuthService.refreshAccessToken).
     */
    private void refreshIfNeeded(Tenant tenant) {
        Instant expiresAt = tenant.getQuickbooksTokenExpiresAt();
        boolean needsRefresh = expiresAt == null || expiresAt.isBefore(Instant.now().plus(1, ChronoUnit.DAYS));
        if (!needsRefresh || tenant.getQuickbooksRefreshToken() == null) {
            return;
        }
        QuickBooksTokenResult refreshed = quickBooksOAuthService.refreshAccessToken(tenant.getQuickbooksRefreshToken());
        tenant.connectQuickbooks(refreshed.accessToken(), refreshed.refreshToken(),
                tenant.getQuickbooksRealmId(), refreshed.expiresAt());
        tenantRepository.save(tenant);
    }

    /**
     * Import a single QuickBooks purchase.
     * Returns true if imported, false if already exists (idempotency).
     */
    private boolean importTransaction(UUID tenantId, QuickBooksPurchase purchase) {
        String externalId = purchase.id();
        if (externalId == null) {
            return false;
        }
        if (transactionRepository.existsByExternalId(externalId)) {
            logger.debug("Skipping duplicate transaction: {}", externalId);
            return false;
        }

        Instant transactionInstant = purchase.transactionDate() != null
                ? purchase.transactionDate().atStartOfDay(ZoneOffset.UTC).toInstant()
                : Instant.now();

        QuickBooksTransaction transaction = new QuickBooksTransaction(
                tenantId, externalId, purchase.totalAmount(), purchase.currency(),
                purchase.accountName(), purchase.payeeName(), transactionInstant);
        transaction.setDescription(purchase.memo());
        transactionRepository.save(transaction);

        // Bridge into the same reviewable Document/ExtractedData pipeline as
        // uploaded receipts and Square payments — there's no real file
        // behind a QuickBooks purchase, so this skips storage and the OCR
        // queue entirely. Unlike Square, category + type are known here (a
        // Purchase is always an expense, already categorized in
        // QuickBooks), so this also creates a BankTransaction row — see
        // DocumentService.createFromExternalData.
        String merchantName = purchase.payeeName() != null ? purchase.payeeName() : "QuickBooks Purchase";
        String category = purchase.accountName() != null ? purchase.accountName() : "Uncategorized";
        Document document = documentService.createFromExternalData(
                tenantId,
                Document.DocumentSource.QUICKBOOKS,
                "quickbooks-" + externalId,
                new ExternalDataSeed(
                        merchantName,
                        purchase.transactionDate(),
                        purchase.totalAmount(),
                        purchase.currency(),
                        category,
                        BankTransaction.Type.EXPENSE));
        transaction.setDocumentId(document.getId());
        transactionRepository.save(transaction);

        logger.debug("Imported QuickBooks transaction: {}", externalId);
        return true;
    }
}
