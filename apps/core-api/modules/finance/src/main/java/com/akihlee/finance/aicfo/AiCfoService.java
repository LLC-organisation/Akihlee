package com.akihlee.finance.aicfo;

import com.akihlee.documents.ExtractedData;
import com.akihlee.documents.ExtractedDataRepository;
import com.akihlee.finance.analytics.AnalyticsService;
import com.akihlee.finance.analytics.CategoryAmount;
import com.akihlee.finance.analytics.FinancialOverview;
import com.akihlee.finance.analytics.MerchantAmount;
import com.akihlee.finance.analytics.MonthlyTrendPoint;
import com.akihlee.identity.Tenant;
import com.akihlee.identity.TenantContext;
import com.akihlee.identity.TenantRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.services.bedrockruntime.BedrockRuntimeClient;
import software.amazon.awssdk.services.bedrockruntime.model.ContentBlock;
import software.amazon.awssdk.services.bedrockruntime.model.ConversationRole;
import software.amazon.awssdk.services.bedrockruntime.model.ConverseRequest;
import software.amazon.awssdk.services.bedrockruntime.model.ConverseResponse;
import software.amazon.awssdk.services.bedrockruntime.model.InferenceConfiguration;
import software.amazon.awssdk.services.bedrockruntime.model.Message;
import software.amazon.awssdk.services.bedrockruntime.model.SystemContentBlock;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * Grounds every reply in the tenant's actual extracted/approved financial
 * data (never lets the model invent figures) and falls back to a canned,
 * still-data-grounded reply if Bedrock is unreachable or misconfigured —
 * same graceful-degradation philosophy as VisionExtractionService's OCR
 * fallback and SquareIntegrationController's SquareNotConfiguredException
 * handling elsewhere in this codebase.
 */
@Service
public class AiCfoService {

    private static final Logger logger = LoggerFactory.getLogger(AiCfoService.class);

    private static final int TOP_CATEGORIES_LIMIT = 5;
    private static final int TOP_MERCHANTS_LIMIT = 5;
    // Bounds token growth from the frontend's ever-growing, unbounded
    // conversation history — there's no server-side persistence to cap it
    // otherwise, so this is enforced here on every call.
    private static final int MAX_HISTORY_TURNS = 20;
    private static final int MAX_OUTPUT_TOKENS = 1024;

    private static final String SYSTEM_PROMPT_TEMPLATE = """
            You are the AI CFO for %s, a small business using the Akihlee platform. You advise \
            the business owner or manager on where the company stands financially, using ONLY \
            the financial summary below — never invent numbers, vendors, or categories that \
            aren't in it.

            Guidelines:
            - Ground every specific figure in the summary. If a question needs data that isn't \
            in the summary (a specific transaction, a period outside the last 12 months), say so \
            plainly and suggest what to upload or ask for instead of guessing.
            - Amounts may combine USD and KES without currency conversion if the business \
            records both — call this out if it would materially affect your answer, otherwise \
            don't dwell on it.
            - Be concise and actionable: lead with the headline (how the business is doing), \
            name what's working and what isn't, and where relevant close with 2-3 concrete next \
            steps.
            - You are not a licensed financial advisor; frame guidance as operational business \
            advice, not tax, legal, or investment advice.

            Financial summary:
            %s
            """;

    private final AnalyticsService analyticsService;
    private final TenantRepository tenantRepository;
    private final ExtractedDataRepository extractedDataRepository;
    private final BedrockRuntimeClient bedrockRuntimeClient;
    private final String modelId;

    public AiCfoService(AnalyticsService analyticsService,
                         TenantRepository tenantRepository,
                         ExtractedDataRepository extractedDataRepository,
                         BedrockRuntimeClient bedrockRuntimeClient,
                         @Value("${bedrock.model-id}") String modelId) {
        this.analyticsService = analyticsService;
        this.tenantRepository = tenantRepository;
        this.extractedDataRepository = extractedDataRepository;
        this.bedrockRuntimeClient = bedrockRuntimeClient;
        this.modelId = modelId;
    }

    public ChatResponse chat(String message, List<ChatTurn> history) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        try {
            return new ChatResponse(callBedrock(tenantId, message, history));
        } catch (SdkException e) {
            logger.warn("Bedrock call failed for tenant {}, falling back to canned reply: {}", tenantId, e.getMessage());
            return new ChatResponse(cannedReply(tenantId));
        }
    }

    private String callBedrock(UUID tenantId, String message, List<ChatTurn> history) {
        String businessName = tenantRepository.findById(tenantId)
                .map(Tenant::getBusinessName)
                .orElse("your business");

        LocalDate to = LocalDate.now();
        LocalDate from = to.minusMonths(12);
        FinancialOverview overview = analyticsService.overview(from, to);
        List<MerchantAmount> topMerchants = analyticsService.topMerchants(from, to, TOP_MERCHANTS_LIMIT);
        String systemPrompt = String.format(
                SYSTEM_PROMPT_TEMPLATE, businessName, buildFinancialSummary(from, to, overview, topMerchants));

        List<Message> messages = new ArrayList<>();
        List<ChatTurn> boundedHistory = history == null ? List.of()
                : history.subList(Math.max(0, history.size() - MAX_HISTORY_TURNS), history.size());
        for (ChatTurn turn : boundedHistory) {
            ConversationRole role = "assistant".equals(turn.role()) ? ConversationRole.ASSISTANT : ConversationRole.USER;
            messages.add(Message.builder().role(role).content(List.of(ContentBlock.fromText(turn.text()))).build());
        }
        messages.add(Message.builder().role(ConversationRole.USER).content(List.of(ContentBlock.fromText(message))).build());

        ConverseResponse response = bedrockRuntimeClient.converse(ConverseRequest.builder()
                .modelId(modelId)
                .system(List.of(SystemContentBlock.builder().text(systemPrompt).build()))
                .messages(messages)
                .inferenceConfig(InferenceConfiguration.builder()
                        .maxTokens(MAX_OUTPUT_TOKENS)
                        .temperature(0.4f)
                        .build())
                .build());

        return response.output().message().content().stream()
                .map(ContentBlock::text)
                .filter(Objects::nonNull)
                .findFirst()
                .orElseThrow(() -> SdkException.create("Bedrock response had no text content", null));
    }

    private String buildFinancialSummary(LocalDate from, LocalDate to, FinancialOverview overview,
                                          List<MerchantAmount> topMerchants) {
        StringBuilder sb = new StringBuilder();
        sb.append("Reporting period: ").append(from).append(" to ").append(to).append(" (trailing 12 months)\n");
        sb.append("Total income: ").append(overview.totalIncome()).append("\n");
        sb.append("Total expenses: ").append(overview.totalExpenses()).append("\n");
        sb.append("Net cash flow: ").append(overview.netCashFlow()).append("\n");

        sb.append("\nTop spending categories:\n");
        List<CategoryAmount> categories = overview.categoryBreakdown();
        if (categories.isEmpty()) {
            sb.append("(none yet — no approved documents with categorized spending)\n");
        } else {
            int rank = 1;
            for (CategoryAmount category : categories.stream().limit(TOP_CATEGORIES_LIMIT).toList()) {
                sb.append(rank++).append(". ").append(category.category()).append(" — ")
                        .append(category.total()).append(" (").append(percentOf(category.total(), overview.totalExpenses()))
                        .append(" of total expenses)\n");
            }
        }

        sb.append("\nTop vendors by spend:\n");
        if (topMerchants.isEmpty()) {
            sb.append("(none yet — no approved receipts/invoices with a merchant name)\n");
        } else {
            int rank = 1;
            for (MerchantAmount merchant : topMerchants) {
                sb.append(rank++).append(". ").append(merchant.merchant()).append(" — ").append(merchant.total()).append("\n");
            }
        }

        sb.append("\nMonthly income vs. expenses:\n");
        List<MonthlyTrendPoint> trend = overview.monthlyTrend();
        if (trend.isEmpty()) {
            sb.append("(no monthly data yet)\n");
        } else {
            for (MonthlyTrendPoint point : trend) {
                sb.append(point.month()).append(": income=").append(point.income())
                        .append(", expenses=").append(point.expense()).append("\n");
            }
        }

        return sb.toString();
    }

    private static String percentOf(BigDecimal part, BigDecimal whole) {
        if (whole == null || whole.signum() <= 0) return "n/a";
        return part.multiply(BigDecimal.valueOf(100)).divide(whole, 1, RoundingMode.HALF_UP) + "%";
    }

    /** Used when Bedrock is unreachable/misconfigured — still grounded in real data, just not LLM-generated. */
    private String cannedReply(UUID tenantId) {
        List<ExtractedData> all = extractedDataRepository.findByTenantId(tenantId, Pageable.unpaged()).getContent();
        if (all.isEmpty()) {
            return "I couldn't reach the AI CFO's language model just now, and there's no data yet to summarize. "
                    + "Upload a few receipts from the Dashboard and try again shortly.";
        }
        BigDecimal total = all.stream()
                .map(ExtractedData::getTotalAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        String currency = all.stream()
                .map(ExtractedData::getCurrency)
                .filter(Objects::nonNull)
                .findFirst()
                .orElse("KES");
        return String.format(
                "I couldn't reach the AI CFO's language model just now. Here's what I can tell you from your "
                        + "data so far: %d processed document(s) totaling approximately %s %s. Please try again "
                        + "in a moment for a full answer.",
                all.size(), currency, total);
    }
}
