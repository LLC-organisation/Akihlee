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
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
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
            totals.merge(categoryOf(txn.getCategory()), txn.getAmount(), BigDecimal::add);
        }
        return toCategoryList(totals);
    }

    /** granularity: null auto-picks DAY for short ranges, MONTH for long ones (see resolveGranularity). */
    public List<TrendPoint> bankTransactionTrend(LocalDate from, LocalDate to, Granularity granularity) {
        Granularity resolved = resolveGranularity(granularity, from, to);
        Map<String, BigDecimal> totals = new TreeMap<>();
        for (BankTransaction txn : approvedExpenseTransactions(from, to)) {
            totals.merge(bucketKey(txn.getTransactionDate(), resolved), txn.getAmount(), BigDecimal::add);
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
            pair[index] = pair[index].add(txn.getAmount());
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
            categoryTotals.merge(categoryOf(txn.getCategory()), txn.getAmount(), BigDecimal::add);
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
            pair[index] = pair[index].add(txn.getAmount());
        }
        List<MonthlyTrendPoint> monthlyTrend = monthly.entrySet().stream()
                .map(e -> new MonthlyTrendPoint(e.getKey(), e.getValue()[0], e.getValue()[1]))
                .toList();

        return new FinancialOverview(
                totalIncome, totalExpenses, totalIncome.subtract(totalExpenses),
                toCategoryList(categoryTotals), monthlyTrend);
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
                .map(BankTransaction::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
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
