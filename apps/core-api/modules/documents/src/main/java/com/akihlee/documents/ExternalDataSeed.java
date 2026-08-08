package com.akihlee.documents;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Already-structured financial data from an external source (e.g. Square)
 * that skips OCR entirely — seeds a Document + ExtractedData pair directly.
 */
public record ExternalDataSeed(
        String merchantName,
        LocalDate transactionDate,
        BigDecimal totalAmount,
        String currency
) {
}
