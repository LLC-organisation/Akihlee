package com.akihlee.documents;

import java.math.BigDecimal;

/**
 * A single structured line item on a receipt or invoice. OCR (Tesseract +
 * regex heuristics) can reliably find a description and total price; it
 * cannot infer SKU, category, or taxability, so those are left null for a
 * person to fill in during review.
 */
public record LineItem(
        String description,
        String sku,
        BigDecimal quantity,
        BigDecimal unitPrice,
        BigDecimal totalPrice,
        String categoryTag,
        Boolean isTaxable
) {
}
