package com.akihlee.documents;

import java.math.BigDecimal;

/**
 * Body for a user-initiated correction of OCR-extracted fields — a subset
 * of ExtractionCallbackRequest's fields (no lineItems/rawText/confidence,
 * which are raw OCR artifacts rather than something a person edits).
 */
public record UpdateExtractedDataRequest(
        String merchantName,
        String transactionDate, // ISO yyyy-MM-dd, or null
        BigDecimal totalAmount,
        String currency,
        BigDecimal taxAmount
) {
}
