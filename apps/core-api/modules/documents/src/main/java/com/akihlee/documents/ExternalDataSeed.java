package com.akihlee.documents;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Already-structured financial data from an external source (e.g. Square,
 * QuickBooks) that skips OCR entirely — seeds a Document + ExtractedData
 * pair directly.
 *
 * category/type are nullable: a source that can't confidently assert a
 * direction and category (Square's flat Payment objects) leaves them null
 * and gets only the ExtractedData row, same as before. A source that
 * already knows both (QuickBooks Purchases always have an expense account
 * and are always an expense) gets a BankTransaction row too, so it
 * participates in category breakdowns, anomaly detection, etc. — see
 * DocumentService.createFromExternalData.
 */
public record ExternalDataSeed(
        String merchantName,
        LocalDate transactionDate,
        BigDecimal totalAmount,
        String currency,
        String category,
        BankTransaction.Type type
) {
    public ExternalDataSeed(String merchantName, LocalDate transactionDate, BigDecimal totalAmount, String currency) {
        this(merchantName, transactionDate, totalAmount, currency, null, null);
    }
}
