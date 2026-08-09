package com.akihlee.finance.analytics;

import java.math.BigDecimal;

/**
 * One point on a spending-over-time trend. period is "yyyy-MM-dd" or
 * "yyyy-MM" depending on how wide the requested date range is — see
 * AnalyticsService.granularityFor.
 */
public record TrendPoint(String period, BigDecimal total) {
}
