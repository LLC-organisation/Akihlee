package com.akihlee.documents;

import java.math.BigDecimal;

/**
 * Body for creating or editing a single bank statement transaction line —
 * also reused as ExtractionCallbackRequest's nested shape for the worker's
 * freshly-extracted transactions. categoryConfidence is only meaningful on
 * that extraction-callback path; BankTransactionController ignores whatever
 * this carries and always stamps 1.0 on a human-initiated create/update.
 */
public record BankTransactionRequest(
        String transactionDate, // ISO yyyy-MM-dd
        String description,
        String payeeOrPayer,
        BigDecimal amount,
        String type, // INCOME | EXPENSE | TRANSFER
        String category,
        Double categoryConfidence
) {
}
