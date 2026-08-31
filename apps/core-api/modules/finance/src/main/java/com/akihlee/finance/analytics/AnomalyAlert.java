package com.akihlee.finance.analytics;

import java.math.BigDecimal;

/** One category where a document's spending is well above the tenant's historical weekly average. */
public record AnomalyAlert(
        String category,
        BigDecimal currentAmount,
        BigDecimal historicalWeeklyAverage,
        double percentAboveAverage,
        String message
) {
}
