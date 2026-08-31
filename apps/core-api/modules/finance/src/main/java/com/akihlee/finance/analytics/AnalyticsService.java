package com.akihlee.finance.analytics;

import com.akihlee.documents.BankTransaction;
import com.akihlee.documents.BankTransactionRepository;
import com.akihlee.documents.Document;
import com.akihlee.documents.DocumentRepository;
import com.akihlee.documents.ExtractedData;
import com.akihlee.documents.ExtractedDataRepository;
import com.akihlee.documents.LineItem;
import com.akihlee.identity.TenantContext;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import java.util.UUID;

/**
 * Aggregates already-extracted, already-approved document data into
 * chart-ready spending breakdowns. Deliberately scoped to APPROVED
 * documents only — a person confirmed these numbers, so they're safe to
 * report as real spending rather than possibly-wrong raw OCR output.
 *
 * Line items (receipts/invoices) and bank transactions are aggregated
 * independently rather than combined into one figure — there's no
 * reconciliation link between a receipt and a matching bank charge in this
 * schema, so summing both would risk double-counting the same purchase.
 */
@Service
public class AnalyticsService {

    private static final Logger logger = LoggerFactory.getLogger(AnalyticsService.class);
    private static final DateTimeFormatter DAY_FORMAT = DateTimeFormatter.ISO_LOCAL_DATE;
    private static final DateTimeFormatter MONTH_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM");
    // Beyond this many days in the requested range, group the trend by month
    // instead of day, so a 12-month range returns ~12 points, not ~365.
    private static final long MONTHLY_GROUPING_THRESHOLD_DAYS = 60;

    private final ExtractedDataRepository extractedDataRepository;
    private final DocumentRepository documentRepository;
    private final BankTransactionRepository bankTransactionRepository;
    private final ObjectMapper objectMapper;

    public AnalyticsService(ExtractedDataRepository extractedDataRepository,
                             DocumentRepository documentRepository,
                             BankTransactionRepository bankTransactionRepository,
                             ObjectMapper objectMapper) {
        this.extractedDataRepository = extractedDataRepository;
        this.documentRepository = documentRepository;
        this.bankTransactionRepository = bankTransactionRepository;
        this.objectMapper = objectMapper;
    }

    public List<CategoryAmount> lineItemCategoryBreakdown(LocalDate from, LocalDate to) {
        Map<String, BigDecimal> totals = new LinkedHashMap<>();
        for (ExtractedData data : approvedExtractedData(from, to)) {
            for (LineItem item : parseLineItems(data)) {
                if (item.totalPrice() == null) continue;
                totals.merge(categoryOf(item.categoryTag()), item.totalPrice(), BigDecimal::add);
            }
        }
        return toCategoryList(totals);
    }

    /**
     * Top spending vendors by total line-item amount — bank transactions are
     * excluded since payeeOrPayer is free-text from the statement rather
     * than a normalized merchant name, so grouping by it wouldn't reliably
     * roll up to the same vendor. Used by the AI CFO to name specific
     * vendors rather than only category-level spending.
     */
    public List<MerchantAmount> topMerchants(LocalDate from, LocalDate to, int limit) {
        Map<String, BigDecimal> totals = new LinkedHashMap<>();
        for (ExtractedData data : approvedExtractedData(from, to)) {
            if (data.getTotalAmount() == null) continue;
            String merchant = data.getMerchantName() != null && !data.getMerchantName().isBlank()
                    ? data.getMerchantName() : "Unknown";
            totals.merge(merchant, data.getTotalAmount(), BigDecimal::add);
        }
        return totals.entrySet().stream()
                .sorted(Map.Entry.<String, BigDecimal>comparingByValue().reversed())
                .limit(limit)
                .map(e -> new MerchantAmount(e.getKey(), e.getValue()))
                .toList();
    }

    /** granularity: null auto-picks DAY for short ranges, MONTH for long ones (see resolveGranularity). */
    public List<TrendPoint> lineItemTrend(LocalDate from, LocalDate to, Granularity granularity) {
        Granularity resolved = resolveGranularity(granularity, from, to);
        Map<String, BigDecimal> totals = new TreeMap<>();
        for (ExtractedData data : approvedExtractedData(from, to)) {
            if (data.getTotalAmount() == null || data.getTransactionDate() == null) continue;
            totals.merge(bucketKey(data.getTransactionDate(), resolved), data.getTotalAmount(), BigDecimal::add);
        }
        return toTrendList(totals);
    }

    public List<CategoryAmount> bankTransactionCategoryBreakdown(LocalDate from, LocalDate to) {
        Map<String, BigDecimal> totals = new LinkedHashMap<>();
        for (BankTransaction txn : approvedExpenseTransactions(from, to)) {
            totals.merge(categoryOf(txn.getCategory()), magnitude(txn), BigDecimal::add);
        }
        return toCategoryList(totals);
    }

    /** granularity: null auto-picks DAY for short ranges, MONTH for long ones (see resolveGranularity). */
    public List<TrendPoint> bankTransactionTrend(LocalDate from, LocalDate to, Granularity granularity) {
        Granularity resolved = resolveGranularity(granularity, from, to);
        Map<String, BigDecimal> totals = new TreeMap<>();
        for (BankTransaction txn : approvedExpenseTransactions(from, to)) {
            totals.merge(bucketKey(txn.getTransactionDate(), resolved), magnitude(txn), BigDecimal::add);
        }
        return toTrendList(totals);
    }

    /**
     * Combined income/expense trend at an explicit granularity — the
     * volatility widget and the Analytics page's "combined" view both need
     * true weekly/quarterly buckets, unlike overview()'s always-monthly
     * trend. Same source data and combining rules as overview(), just
     * bucketed by the caller's chosen Granularity instead of hardcoded MONTH.
     */
    public List<MonthlyTrendPoint> combinedTrend(LocalDate from, LocalDate to, Granularity granularity) {
        Granularity resolved = resolveGranularity(granularity, from, to);
        List<ExtractedData> extractedData = approvedExtractedData(from, to);
        List<BankTransaction> bankTransactions = approvedBankTransactions(from, to);

        Map<String, BigDecimal[]> buckets = new TreeMap<>();
        for (ExtractedData data : extractedData) {
            if (data.getTotalAmount() == null || data.getTransactionDate() == null) continue;
            BigDecimal[] pair = buckets.computeIfAbsent(
                    bucketKey(data.getTransactionDate(), resolved), k -> new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
            pair[1] = pair[1].add(data.getTotalAmount());
        }
        for (BankTransaction txn : bankTransactions) {
            if (txn.getType() == BankTransaction.Type.TRANSFER) continue;
            BigDecimal[] pair = buckets.computeIfAbsent(
                    bucketKey(txn.getTransactionDate(), resolved), k -> new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
            int index = txn.getType() == BankTransaction.Type.INCOME ? 0 : 1;
            pair[index] = pair[index].add(magnitude(txn));
        }
        return buckets.entrySet().stream()
                .map(e -> new MonthlyTrendPoint(e.getKey(), e.getValue()[0], e.getValue()[1]))
                .toList();
    }

    /**
     * Dashboard summary widget: unlike the per-source methods above, this
     * merges line items (receipts/invoices — always spend) with bank
     * transactions (both INCOME and EXPENSE) into one combined view, since
     * the dashboard wants a single "how's cash flow" answer rather than the
     * Analytics page's deliberately-separate breakdowns.
     */
    public FinancialOverview overview(LocalDate from, LocalDate to) {
        List<ExtractedData> extractedData = approvedExtractedData(from, to);
        List<BankTransaction> bankTransactions = approvedBankTransactions(from, to);

        BigDecimal lineItemExpenses = extractedData.stream()
                .map(ExtractedData::getTotalAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal bankExpenses = sumByType(bankTransactions, BankTransaction.Type.EXPENSE);
        BigDecimal totalIncome = sumByType(bankTransactions, BankTransaction.Type.INCOME);
        BigDecimal totalExpenses = lineItemExpenses.add(bankExpenses);

        Map<String, BigDecimal> categoryTotals = new LinkedHashMap<>();
        for (ExtractedData data : extractedData) {
            for (LineItem item : parseLineItems(data)) {
                if (item.totalPrice() == null) continue;
                categoryTotals.merge(categoryOf(item.categoryTag()), item.totalPrice(), BigDecimal::add);
            }
        }
        for (BankTransaction txn : bankTransactions) {
            if (txn.getType() != BankTransaction.Type.EXPENSE) continue;
            categoryTotals.merge(categoryOf(txn.getCategory()), magnitude(txn), BigDecimal::add);
        }

        Map<String, BigDecimal[]> monthly = new TreeMap<>();
        for (ExtractedData data : extractedData) {
            if (data.getTotalAmount() == null || data.getTransactionDate() == null) continue;
            BigDecimal[] pair = monthlyBucket(monthly, data.getTransactionDate());
            pair[1] = pair[1].add(data.getTotalAmount());
        }
        for (BankTransaction txn : bankTransactions) {
            if (txn.getType() == BankTransaction.Type.TRANSFER) continue;
            BigDecimal[] pair = monthlyBucket(monthly, txn.getTransactionDate());
            int index = txn.getType() == BankTransaction.Type.INCOME ? 0 : 1;
            pair[index] = pair[index].add(magnitude(txn));
        }
        List<MonthlyTrendPoint> monthlyTrend = monthly.entrySet().stream()
                .map(e -> new MonthlyTrendPoint(e.getKey(), e.getValue()[0], e.getValue()[1]))
                .toList();

        return new FinancialOverview(
                totalIncome, totalExpenses, totalIncome.subtract(totalExpenses),
                toCategoryList(categoryTotals), monthlyTrend);
    }

    /**
     * Every approved line item / EXPENSE bank transaction currently filed
     * under the given category, for the "click a category pill to
     * reassign" flow on the Analytics and Dashboard pages.
     */
    public CategoryDrilldown categoryDrilldown(String category, LocalDate from, LocalDate to) {
        List<CategorizedLineItem> lineItemMatches = new ArrayList<>();
        for (ExtractedData data : approvedExtractedData(from, to)) {
            if (data.getTransactionDate() == null) continue;
            List<LineItem> items = parseLineItems(data);
            for (int i = 0; i < items.size(); i++) {
                LineItem item = items.get(i);
                if (item.totalPrice() == null || !categoryOf(item.categoryTag()).equals(category)) continue;
                lineItemMatches.add(new CategorizedLineItem(
                        data.getId(), data.getDocumentId(), i, data.getTransactionDate(),
                        data.getMerchantName(), item.description(), item.totalPrice(), categoryOf(item.categoryTag())));
            }
        }
        List<BankTransaction> bankMatches = approvedExpenseTransactions(from, to).stream()
                .filter(txn -> categoryOf(txn.getCategory()).equals(category))
                .toList();
        return new CategoryDrilldown(lineItemMatches, bankMatches);
    }

    private static final int ANOMALY_LOOKBACK_WEEKS = 8;
    // A category has to run at least 20% above its trailing weekly average
    // to surface an alert — this is meant to catch a real, worth-a-look
    // spike, not every week's ordinary variance.
    private static final BigDecimal ANOMALY_THRESHOLD = new BigDecimal("0.20");

    /**
     * Flags EXPENSE categories in one bank statement that run well above the
     * tenant's own trailing weekly average for that category — e.g. "Sysco
     * inventory purchases are 35% above your weekly average." Compared
     * against APPROVED history only (excluding this document itself), same
     * "confirmed numbers only" rule as the rest of this service. Returns
     * nothing for a category with no prior history — there's nothing to
     * compare against yet, not evidence of anomaly-free spending.
     */
    public List<AnomalyAlert> detectAnomalies(UUID extractedDataId) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        ExtractedData data = extractedDataRepository.findById(extractedDataId)
                .filter(d -> d.getTenantId().equals(tenantId))
                .orElse(null);
        if (data == null || data.getTransactionDate() == null) {
            return List.of();
        }

        Map<String, BigDecimal> currentTotals = new LinkedHashMap<>();
        for (BankTransaction txn : bankTransactionRepository.findByExtractedDataIdOrderByTransactionDateAsc(extractedDataId)) {
            if (txn.getType() != BankTransaction.Type.EXPENSE) continue;
            currentTotals.merge(categoryOf(txn.getCategory()), magnitude(txn), BigDecimal::add);
        }
        if (currentTotals.isEmpty()) {
            return List.of();
        }

        LocalDate statementEnd = data.getTransactionDate();
        LocalDate historyStart = statementEnd.minusWeeks(ANOMALY_LOOKBACK_WEEKS);
        Map<String, BigDecimal> historicalTotals = new LinkedHashMap<>();
        for (BankTransaction txn : approvedExpenseTransactions(historyStart, statementEnd.minusDays(1))) {
            if (txn.getExtractedDataId().equals(extractedDataId)) continue; // never compare this document against itself
            historicalTotals.merge(categoryOf(txn.getCategory()), magnitude(txn), BigDecimal::add);
        }

        List<AnomalyAlert> alerts = new ArrayList<>();
        for (Map.Entry<String, BigDecimal> entry : currentTotals.entrySet()) {
            String category = entry.getKey();
            BigDecimal current = entry.getValue();
            BigDecimal historicalTotal = historicalTotals.get(category);
            if (historicalTotal == null || historicalTotal.compareTo(BigDecimal.ZERO) <= 0) {
                continue; // no prior history for this category — nothing to compare against
            }
            BigDecimal weeklyAverage = historicalTotal.divide(BigDecimal.valueOf(ANOMALY_LOOKBACK_WEEKS), 2, RoundingMode.HALF_UP);
            if (weeklyAverage.compareTo(BigDecimal.ZERO) <= 0) continue;
            BigDecimal excess = current.subtract(weeklyAverage);
            if (excess.compareTo(weeklyAverage.multiply(ANOMALY_THRESHOLD)) <= 0) continue;

            double percentAbove = excess.divide(weeklyAverage, 4, RoundingMode.HALF_UP).doubleValue() * 100;
            String message = String.format(
                    "%s spending ($%.2f) is %.0f%% above your typical weekly average ($%.2f).",
                    category, current, percentAbove, weeklyAverage);
            alerts.add(new AnomalyAlert(category, current, weeklyAverage, percentAbove, message));
        }
        return alerts.stream()
                .sorted(Comparator.comparingDouble(AnomalyAlert::percentAboveAverage).reversed())
                .toList();
    }

    private static final int PROJECTION_LOOKBACK_DAYS = 60;
    private static final int PROJECTION_HORIZON_DAYS = 30;

    /**
     * Linear 30-day projection of cumulative net cash flow (income minus
     * expenses), extrapolated from the tenant's own trailing 60-day daily
     * average — deliberately the simplest model that's still honest about
     * what it is: a straight-line continuation of recent behavior, not a
     * seasonally-aware or ML forecast. TRANSFER rows are excluded (moving
     * money between the business's own accounts isn't net cash flow).
     */
    public List<CashFlowProjection> projectedCashFlow() {
        LocalDate today = LocalDate.now();
        LocalDate historyStart = today.minusDays(PROJECTION_LOOKBACK_DAYS);

        BigDecimal netMovement = BigDecimal.ZERO;
        for (BankTransaction txn : approvedBankTransactions(historyStart, today)) {
            if (txn.getType() == BankTransaction.Type.TRANSFER) continue;
            BigDecimal signed = txn.getType() == BankTransaction.Type.INCOME ? magnitude(txn) : magnitude(txn).negate();
            netMovement = netMovement.add(signed);
        }
        BigDecimal dailyAverage = netMovement.divide(BigDecimal.valueOf(PROJECTION_LOOKBACK_DAYS), 6, RoundingMode.HALF_UP);

        List<CashFlowProjection> projection = new ArrayList<>();
        BigDecimal cumulative = BigDecimal.ZERO;
        for (int i = 1; i <= PROJECTION_HORIZON_DAYS; i++) {
            cumulative = cumulative.add(dailyAverage);
            projection.add(new CashFlowProjection(
                    today.plusDays(i).format(DAY_FORMAT), cumulative.setScale(2, RoundingMode.HALF_UP)));
        }
        return projection;
    }

    /** Extracted data belonging to the current tenant's APPROVED documents, filtered to the date range. */
    private List<ExtractedData> approvedExtractedData(LocalDate from, LocalDate to) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        List<UUID> approvedDocumentIds = approvedDocumentIds(tenantId);
        if (approvedDocumentIds.isEmpty()) return List.of();
        return extractedDataRepository.findByTenantIdAndDocumentIdInAndTransactionDateBetween(
                tenantId, approvedDocumentIds, from, to);
    }

    /** EXPENSE bank transactions belonging to the current tenant's APPROVED documents, filtered to the date range. */
    private List<BankTransaction> approvedExpenseTransactions(LocalDate from, LocalDate to) {
        List<UUID> extractedDataIds = approvedExtractedDataIds();
        if (extractedDataIds.isEmpty()) return List.of();
        return bankTransactionRepository.findByExtractedDataIdInAndTypeAndTransactionDateBetween(
                extractedDataIds, BankTransaction.Type.EXPENSE, from, to);
    }

    /** All bank transactions (INCOME, EXPENSE, and TRANSFER) for approved documents, filtered to the date range. */
    private List<BankTransaction> approvedBankTransactions(LocalDate from, LocalDate to) {
        List<UUID> extractedDataIds = approvedExtractedDataIds();
        if (extractedDataIds.isEmpty()) return List.of();
        return bankTransactionRepository.findByExtractedDataIdInAndTransactionDateBetween(
                extractedDataIds, from, to);
    }

    /**
     * IDs of extracted-data rows belonging to the current tenant's APPROVED
     * documents — bank transactions link to extracted_data, not documents,
     * directly, so this is one more hop than the line-item path above.
     */
    private List<UUID> approvedExtractedDataIds() {
        UUID tenantId = TenantContext.getCurrentTenantId();
        List<UUID> approvedDocumentIds = approvedDocumentIds(tenantId);
        if (approvedDocumentIds.isEmpty()) return List.of();
        return extractedDataRepository.findByTenantIdAndDocumentIdIn(tenantId, approvedDocumentIds)
                .stream().map(ExtractedData::getId).toList();
    }

    private List<UUID> approvedDocumentIds(UUID tenantId) {
        return documentRepository.findByTenantIdAndStatus(tenantId, Document.DocumentStatus.APPROVED)
                .stream().map(Document::getId).toList();
    }

    private static BigDecimal[] monthlyBucket(Map<String, BigDecimal[]> monthly, LocalDate date) {
        return monthly.computeIfAbsent(date.format(MONTH_FORMAT), k -> new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
    }

    private static BigDecimal sumByType(List<BankTransaction> transactions, BankTransaction.Type type) {
        return transactions.stream()
                .filter(t -> t.getType() == type)
                .map(AnalyticsService::magnitude)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /**
     * A bank transaction's amount as extracted can carry whatever sign the
     * raw statement printed it with (e.g. a debit shown as "-150.00"), but
     * its Type is already the authoritative signal for direction — every
     * aggregate here is either grouped by type or filtered to one type
     * before summing. Without normalizing to a magnitude, a category or
     * period dominated by negative-signed EXPENSE rows nets out negative,
     * which breaks anything that assumes spending totals are non-negative
     * (e.g. a pie chart's proportions).
     */
    private static BigDecimal magnitude(BankTransaction txn) {
        return txn.getAmount().abs();
    }

    private List<LineItem> parseLineItems(ExtractedData data) {
        String json = data.getLineItemsJson();
        if (json == null || json.isBlank()) return List.of();
        try {
            return objectMapper.readValue(json, new TypeReference<List<LineItem>>() {
            });
        } catch (Exception e) {
            logger.warn("Could not parse lineItemsJson for extracted data {}: {}", data.getId(), e.getMessage());
            return List.of();
        }
    }

    private static String categoryOf(String rawCategory) {
        return rawCategory != null && !rawCategory.isBlank() ? rawCategory : "Uncategorized";
    }

    private static Granularity resolveGranularity(Granularity requested, LocalDate from, LocalDate to) {
        if (requested != null) return requested;
        long days = ChronoUnit.DAYS.between(from, to);
        return days > MONTHLY_GROUPING_THRESHOLD_DAYS ? Granularity.MONTH : Granularity.DAY;
    }

    /** WEEK buckets key on the Monday of that ISO week; QUARTER buckets key on "yyyy-Qn". */
    private static String bucketKey(LocalDate date, Granularity granularity) {
        return switch (granularity) {
            case DAY -> date.format(DAY_FORMAT);
            case WEEK -> date.minusDays(date.getDayOfWeek().getValue() - 1).format(DAY_FORMAT);
            case MONTH -> date.format(MONTH_FORMAT);
            case QUARTER -> date.getYear() + "-Q" + ((date.getMonthValue() - 1) / 3 + 1);
        };
    }

    private static List<CategoryAmount> toCategoryList(Map<String, BigDecimal> totals) {
        return totals.entrySet().stream()
                .sorted(Map.Entry.<String, BigDecimal>comparingByValue().reversed())
                .map(e -> new CategoryAmount(e.getKey(), e.getValue()))
                .toList();
    }

    private static List<TrendPoint> toTrendList(Map<String, BigDecimal> totals) {
        // totals is a TreeMap keyed by period string — "yyyy-MM-dd" and
        // "yyyy-MM" both sort correctly as plain strings, so insertion order
        // from the TreeMap is already chronological.
        return totals.entrySet().stream()
                .map(e -> new TrendPoint(e.getKey(), e.getValue()))
                .toList();
    }
}
