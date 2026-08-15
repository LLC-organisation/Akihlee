package com.akihlee.finance.analytics;

import java.math.BigDecimal;
import java.util.List;

/**
 * Combined-source summary for the dashboard's financial overview widget.
 * Unlike the other AnalyticsService methods, this merges line items
 * (receipts/invoices, always treated as spend) with bank transactions
 * (both INCOME and EXPENSE) into one set of figures — so, unlike the
 * per-source breakdowns on the Analytics page, a receipt and the bank
 * charge that paid it can both land in totalExpenses.
 */
public record FinancialOverview(
        BigDecimal totalIncome,
        BigDecimal totalExpenses,
        BigDecimal netCashFlow,
        List<CategoryAmount> categoryBreakdown,
        List<MonthlyTrendPoint> monthlyTrend) {
}
