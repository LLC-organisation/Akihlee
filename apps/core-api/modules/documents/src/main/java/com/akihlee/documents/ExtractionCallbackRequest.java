package com.akihlee.documents;

import java.math.BigDecimal;
import java.util.List;

/**
 * Body posted by document-worker once OCR extraction finishes for a document.
 */
public record ExtractionCallbackRequest(
        String merchantName,
        String transactionDate, // ISO yyyy-MM-dd, or null if not detected
        BigDecimal totalAmount,
        String currency,
        BigDecimal taxAmount,
        List<String> lineItems,
        String rawText,
        double confidence,
        String status // "EXTRACTED" or "REVIEW_REQUIRED"
) {
}
