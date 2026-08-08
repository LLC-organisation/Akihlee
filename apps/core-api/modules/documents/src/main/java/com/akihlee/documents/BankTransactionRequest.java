package com.akihlee.documents;

import java.math.BigDecimal;

/**
 * Body for creating or editing a single bank statement transaction line.
 */
public record BankTransactionRequest(
        String transactionDate, // ISO yyyy-MM-dd
        String description,
        String payeeOrPayer,
        BigDecimal amount,
        String type, // INCOME | EXPENSE | TRANSFER
        String category
) {
}
