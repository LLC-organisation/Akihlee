package com.akihlee.documents;

import java.math.BigDecimal;

/**
 * A single structured line item on a receipt or invoice. OCR (Tesseract +
 * regex heuristics) can reliably find a description and total price; it
 * cannot infer SKU, category, or taxability, so those are left null for a
 * person to fill in during review.
 *
 * itemName is a short product/service name distinct from description (e.g.
 * "Consulting Services" vs. a longer free-text line) — populated for INVOICE
 * documents only; left null for receipts and for the OCR regex fallback,
 * which can't reliably separate a name from the full line text.
 */
public record LineItem(
        String itemName,
        String description,
        String sku,
        BigDecimal quantity,
        BigDecimal unitPrice,
        BigDecimal totalPrice,
        String categoryTag,
        Boolean isTaxable,
        // How confident the extraction engine was in categoryTag (0-1), or
        // null. Threaded through for parity with BankTransaction's same
        // field — see that class for the confidence-badge UI this feeds.
        Double categoryConfidence
) {
}
