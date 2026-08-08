package com.akihlee.finance.integrations.square;

import com.akihlee.documents.Document;
import com.akihlee.documents.DocumentService;
import com.akihlee.documents.ExternalDataSeed;
import com.akihlee.identity.TenantContext;
import com.squareup.square.models.Payment;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Service for syncing Square transactions to the local database.
 * Implements idempotent import to prevent duplicates.
 */
@Service
public class SquareSyncService {

    private static final Logger logger = LoggerFactory.getLogger(SquareSyncService.class);

    private final SquareApiClient squareApiClient;
    private final SquareTransactionRepository transactionRepository;
    private final DocumentService documentService;

    public SquareSyncService(SquareApiClient squareApiClient,
                             SquareTransactionRepository transactionRepository,
                             DocumentService documentService) {
        this.squareApiClient = squareApiClient;
        this.transactionRepository = transactionRepository;
        this.documentService = documentService;
    }

    /**
     * Sync Square payments for the current tenant within a date range.
     * Idempotent - duplicate transactions are skipped based on external ID.
     *
     * @param startDate Start of sync range
     * @param endDate End of sync range
     * @return Number of new transactions imported
     */
    @Transactional
    public int syncTransactions(Instant startDate, Instant endDate) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        logger.info("Syncing Square transactions for tenant {} from {} to {}",
                    tenantId, startDate, endDate);

        // Fetch payments from Square API
        List<Payment> payments = squareApiClient.fetchPayments(null, startDate, endDate);

        int importedCount = 0;
        for (Payment payment : payments) {
            if (importTransaction(tenantId, payment)) {
                importedCount++;
            }
        }

        logger.info("Imported {} new Square transactions for tenant {}", importedCount, tenantId);
        return importedCount;
    }

    /**
     * Import a single Square payment.
     * Returns true if imported, false if already exists (idempotency).
     */
    private boolean importTransaction(UUID tenantId, Payment payment) {
        String externalId = payment.getId();

        // Idempotency check - skip if already imported
        if (transactionRepository.existsByExternalId(externalId)) {
            logger.debug("Skipping duplicate transaction: {}", externalId);
            return false;
        }

        // Convert Square payment to our model
        SquareTransaction transaction = mapPaymentToTransaction(tenantId, payment);
        transactionRepository.save(transaction);

        // Bridge into the same reviewable Document/ExtractedData pipeline as
        // uploaded/emailed/WhatsApp receipts — there's no real file behind a
        // Square payment, so this skips storage and the OCR queue entirely.
        Document document = documentService.createFromExternalData(
                tenantId,
                Document.DocumentSource.SQUARE,
                "square-" + externalId,
                new ExternalDataSeed(
                        transaction.getDescription(),
                        transaction.getTransactionDate().atZone(ZoneOffset.UTC).toLocalDate(),
                        transaction.getAmount(),
                        transaction.getCurrency()));
        transaction.setDocumentId(document.getId());
        transactionRepository.save(transaction);

        logger.debug("Imported Square transaction: {}", externalId);
        return true;
    }

    /**
     * Map Square Payment to SquareTransaction entity.
     */
    private SquareTransaction mapPaymentToTransaction(UUID tenantId, Payment payment) {
        // Extract amount (Square uses smallest currency unit - cents for USD)
        long amountMoney = payment.getAmountMoney() != null ?
            payment.getAmountMoney().getAmount() : 0L;
        BigDecimal amount = BigDecimal.valueOf(amountMoney).divide(BigDecimal.valueOf(100));

        String currency = payment.getAmountMoney() != null ?
            payment.getAmountMoney().getCurrency().toString() : "USD";

        // Determine transaction type and status
        SquareTransaction.TransactionType type = SquareTransaction.TransactionType.PAYMENT;
        SquareTransaction.TransactionStatus status = mapSquareStatus(payment.getStatus());

        // Parse transaction date
        Instant transactionDate = payment.getCreatedAt() != null ?
            Instant.parse(payment.getCreatedAt()) : Instant.now();

        SquareTransaction transaction = new SquareTransaction(
            tenantId,
            payment.getId(),
            amount,
            currency,
            type,
            status,
            transactionDate
        );

        // Set optional fields
        if (payment.getLocationId() != null) {
            transaction.setLocationId(payment.getLocationId());
        }

        if (payment.getNote() != null) {
            transaction.setDescription(payment.getNote());
        }

        return transaction;
    }

    /**
     * Map Square payment status to our internal status.
     */
    private SquareTransaction.TransactionStatus mapSquareStatus(String squareStatus) {
        if (squareStatus == null) {
            return SquareTransaction.TransactionStatus.PENDING;
        }

        return switch (squareStatus) {
            case "COMPLETED" -> SquareTransaction.TransactionStatus.COMPLETED;
            case "PENDING" -> SquareTransaction.TransactionStatus.PENDING;
            case "FAILED" -> SquareTransaction.TransactionStatus.FAILED;
            case "CANCELED" -> SquareTransaction.TransactionStatus.CANCELED;
            default -> SquareTransaction.TransactionStatus.PENDING;
        };
    }

    /**
     * Get unreconciled transactions for the current tenant.
     * These need to be posted to the ledger.
     */
    public List<SquareTransaction> getUnreconciledTransactions() {
        UUID tenantId = TenantContext.getCurrentTenantId();
        return transactionRepository.findByTenantIdAndReconciledFalse(tenantId);
    }
}
