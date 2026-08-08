package com.akihlee.documents;

import java.math.BigDecimal;
import java.util.List;

/**
 * Body for a user-initiated correction of OCR-extracted fields — a subset
 * of ExtractionCallbackRequest's fields (no rawText/confidence, which are
 * raw OCR artifacts rather than something a person edits).
 *
 * lineItems is nullable and left untouched when omitted — callers that
 * don't send it (e.g. the extracted-data list page's inline field edits)
 * must not have it wiped by an unrelated correction.
 */
public record UpdateExtractedDataRequest(
        String merchantName,
        String transactionDate, // ISO yyyy-MM-dd, or null
        BigDecimal totalAmount,
        String currency,
        BigDecimal taxAmount,
        List<LineItem> lineItems
) {
}
