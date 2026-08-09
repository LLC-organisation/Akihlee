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

    public List<TrendPoint> lineItemTrend(LocalDate from, LocalDate to) {
        DateTimeFormatter formatter = granularityFor(from, to);
        Map<String, BigDecimal> totals = new TreeMap<>();
        for (ExtractedData data : approvedExtractedData(from, to)) {
            if (data.getTotalAmount() == null || data.getTransactionDate() == null) continue;
            totals.merge(data.getTransactionDate().format(formatter), data.getTotalAmount(), BigDecimal::add);
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

    public List<TrendPoint> bankTransactionTrend(LocalDate from, LocalDate to) {
        DateTimeFormatter formatter = granularityFor(from, to);
        Map<String, BigDecimal> totals = new TreeMap<>();
        for (BankTransaction txn : approvedExpenseTransactions(from, to)) {
            totals.merge(txn.getTransactionDate().format(formatter), txn.getAmount(), BigDecimal::add);
        }
        return toTrendList(totals);
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
        UUID tenantId = TenantContext.getCurrentTenantId();
        List<UUID> approvedDocumentIds = approvedDocumentIds(tenantId);
        if (approvedDocumentIds.isEmpty()) return List.of();
        // Bank transactions link to extracted_data, not documents, directly —
        // one more hop than the line-item path above, and not itself date-filtered
        // (the actual date filter happens in the query below).
        List<UUID> extractedDataIds = extractedDataRepository
                .findByTenantIdAndDocumentIdIn(tenantId, approvedDocumentIds)
                .stream().map(ExtractedData::getId).toList();
        if (extractedDataIds.isEmpty()) return List.of();
        return bankTransactionRepository.findByExtractedDataIdInAndTypeAndTransactionDateBetween(
                extractedDataIds, BankTransaction.Type.EXPENSE, from, to);
    }

    private List<UUID> approvedDocumentIds(UUID tenantId) {
        return documentRepository.findByTenantIdAndStatus(tenantId, Document.DocumentStatus.APPROVED)
                .stream().map(Document::getId).toList();
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

    private static DateTimeFormatter granularityFor(LocalDate from, LocalDate to) {
        long days = ChronoUnit.DAYS.between(from, to);
        return days > MONTHLY_GROUPING_THRESHOLD_DAYS ? MONTH_FORMAT : DAY_FORMAT;
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
