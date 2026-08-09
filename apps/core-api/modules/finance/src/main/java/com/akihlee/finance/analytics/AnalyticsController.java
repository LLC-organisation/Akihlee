package com.akihlee.finance.analytics;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

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
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return analyticsService.lineItemTrend(resolveFrom(from, to), resolveTo(to));
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
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return analyticsService.bankTransactionTrend(resolveFrom(from, to), resolveTo(to));
    }

    private static LocalDate resolveTo(LocalDate to) {
        return to != null ? to : LocalDate.now();
    }

    private static LocalDate resolveFrom(LocalDate from, LocalDate to) {
        return from != null ? from : resolveTo(to).minusMonths(12);
    }
}
