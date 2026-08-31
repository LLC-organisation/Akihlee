package com.akihlee.finance.integrations.quickbooks;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * A Purchase (expense) transaction fetched from QuickBooks' Accounting
 * Query API — a subset of the real Purchase entity's fields (confirmed
 * against Intuit's own SDK source: Purchase.java/Transaction.java/
 * IntuitEntity.java), just what the sync path needs.
 */
record QuickBooksPurchase(
        String id,
        LocalDate transactionDate,
        BigDecimal totalAmount,
        String currency,
        String accountName,
        String payeeName,
        String memo
) {
}
