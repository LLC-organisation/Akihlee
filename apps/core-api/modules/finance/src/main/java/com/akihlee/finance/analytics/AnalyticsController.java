package com.akihlee.finance.analytics;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Chart-ready spending aggregation for the Analytics page. All four
 * endpoints are tenant-scoped (via TenantContext inside AnalyticsService)
 * and default to the trailing 12 months when from/to are omitted.
 */
@RestController
@RequestMapping("/api/v1/analytics")
public class AnalyticsController {

    private final AnalyticsService analyticsService;

    public AnalyticsController(AnalyticsService analyticsService) {
        this.analyticsService = analyticsService;
    }

    @GetMapping("/line-item-categories")
    public List<CategoryAmount> lineItemCategories(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return analyticsService.lineItemCategoryBreakdown(resolveFrom(from, to), resolveTo(to));
    }

    @GetMapping("/line-item-trend")
    public List<TrendPoint> lineItemTrend(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Granularity granularity) {
        return analyticsService.lineItemTrend(resolveFrom(from, to), resolveTo(to), granularity);
    }

    @GetMapping("/bank-transaction-categories")
    public List<CategoryAmount> bankTransactionCategories(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return analyticsService.bankTransactionCategoryBreakdown(resolveFrom(from, to), resolveTo(to));
    }

    @GetMapping("/bank-transaction-trend")
    public List<TrendPoint> bankTransactionTrend(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Granularity granularity) {
        return analyticsService.bankTransactionTrend(resolveFrom(from, to), resolveTo(to), granularity);
    }

    /** Combined income/expense summary for the dashboard's financial overview widget. */
    @GetMapping("/overview")
    public FinancialOverview overview(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return analyticsService.overview(resolveFrom(from, to), resolveTo(to));
    }

    /** Combined income/expense trend at an explicit granularity — powers the dashboard's volatility widget and the Analytics page's combined view. */
    @GetMapping("/combined-trend")
    public List<MonthlyTrendPoint> combinedTrend(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Granularity granularity) {
        return analyticsService.combinedTrend(resolveFrom(from, to), resolveTo(to), granularity);
    }

    /** Everything currently filed under one category — backs the "click a category pill to reassign" flow. */
    @GetMapping("/category-transactions")
    public CategoryDrilldown categoryTransactions(
            @RequestParam String category,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return analyticsService.categoryDrilldown(category, resolveFrom(from, to), resolveTo(to));
    }

    /** Vendor/category spending spikes on one bank statement vs. the tenant's own trailing weekly average. */
    @GetMapping("/anomalies/{extractedDataId}")
    public List<AnomalyAlert> anomalies(@PathVariable UUID extractedDataId) {
        return analyticsService.detectAnomalies(extractedDataId);
    }

    /** 30-day linear projection of cumulative net cash flow, extrapolated from the trailing 60 days. */
    @GetMapping("/cash-flow-projection")
    public List<CashFlowProjection> cashFlowProjection() {
        return analyticsService.projectedCashFlow();
    }

    private static LocalDate resolveTo(LocalDate to) {
        return to != null ? to : LocalDate.now();
    }

    private static LocalDate resolveFrom(LocalDate from, LocalDate to) {
        return from != null ? from : resolveTo(to).minusMonths(12);
    }
}
