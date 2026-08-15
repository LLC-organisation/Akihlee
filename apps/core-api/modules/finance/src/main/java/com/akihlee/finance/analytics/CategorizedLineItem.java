package com.akihlee.finance.analytics;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/**
 * One line item matching a category drill-down query. lineItemIndex is its
 * position within the parent ExtractedData's lineItemsJson array — line
 * items have no stable id of their own, so a category override has to go
 * back through ExtractedDataController with (extractedDataId, index) to
 * find the same entry again.
 */
public record CategorizedLineItem(
        UUID extractedDataId,
        UUID documentId,
        int lineItemIndex,
        LocalDate date,
        String vendor,
        String description,
        BigDecimal amount,
        String category) {
}
