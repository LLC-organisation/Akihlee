package com.akihlee.finance.aicfo;

import com.akihlee.documents.ExtractedData;
import com.akihlee.documents.ExtractedDataRepository;
import com.akihlee.finance.analytics.AnalyticsService;
import com.akihlee.finance.analytics.FinancialOverview;
import com.akihlee.identity.Tenant;
import com.akihlee.identity.TenantContext;
import com.akihlee.identity.TenantRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import software.amazon.awssdk.core.exception.SdkClientException;
import software.amazon.awssdk.services.bedrockruntime.BedrockRuntimeClient;
import software.amazon.awssdk.services.bedrockruntime.model.ContentBlock;
import software.amazon.awssdk.services.bedrockruntime.model.ConversationRole;
import software.amazon.awssdk.services.bedrockruntime.model.ConverseOutput;
import software.amazon.awssdk.services.bedrockruntime.model.ConverseRequest;
import software.amazon.awssdk.services.bedrockruntime.model.ConverseResponse;
import software.amazon.awssdk.services.bedrockruntime.model.Message;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AiCfoServiceTest {

    @Mock
    private AnalyticsService analyticsService;

    @Mock
    private TenantRepository tenantRepository;

    @Mock
    private ExtractedDataRepository extractedDataRepository;

    @Mock
    private BedrockRuntimeClient bedrockRuntimeClient;

    private AiCfoService aiCfoService;
    private UUID tenantId;

    @BeforeEach
    void setUp() {
        aiCfoService = new AiCfoService(
                analyticsService, tenantRepository, extractedDataRepository, bedrockRuntimeClient,
                "us.anthropic.claude-sonnet-4-5-20250929-v1:0");
        tenantId = UUID.randomUUID();
        TenantContext.setCurrentTenantId(tenantId);
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    @Test
    void chat_returnsBedrockReply_whenCallSucceeds() {
        when(tenantRepository.findById(tenantId)).thenReturn(java.util.Optional.of(new Tenant("Café Mocha")));
        when(analyticsService.overview(any(), any())).thenReturn(
                new FinancialOverview(BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, List.of(), List.of()));
        when(analyticsService.topMerchants(any(), any(), org.mockito.ArgumentMatchers.anyInt())).thenReturn(List.of());

        ConverseResponse response = ConverseResponse.builder()
                .output(ConverseOutput.fromMessage(Message.builder()
                        .role(ConversationRole.ASSISTANT)
                        .content(List.of(ContentBlock.fromText("Your top expense is rent.")))
                        .build()))
                .build();
        when(bedrockRuntimeClient.converse(any(ConverseRequest.class))).thenReturn(response);

        ChatResponse result = aiCfoService.chat("What are my top expenses?", List.of());

        assertThat(result.reply()).isEqualTo("Your top expense is rent.");
    }

    @Test
    void chat_fallsBackToCannedReply_whenBedrockCallFails() {
        when(tenantRepository.findById(tenantId)).thenReturn(java.util.Optional.of(new Tenant("Café Mocha")));
        when(analyticsService.overview(any(), any())).thenReturn(
                new FinancialOverview(BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, List.of(), List.of()));
        when(analyticsService.topMerchants(any(), any(), org.mockito.ArgumentMatchers.anyInt())).thenReturn(List.of());
        when(bedrockRuntimeClient.converse(any(ConverseRequest.class)))
                .thenThrow(SdkClientException.create("Bedrock unreachable"));

        ExtractedData data = new ExtractedData(UUID.randomUUID(), tenantId, "receipt.pdf");
        data.setTotalAmount(new BigDecimal("42.00"));
        data.setCurrency("USD");
        Page<ExtractedData> page = new PageImpl<>(List.of(data));
        when(extractedDataRepository.findByTenantId(org.mockito.ArgumentMatchers.eq(tenantId), any())).thenReturn(page);

        ChatResponse result = aiCfoService.chat("What are my top expenses?", List.of());

        assertThat(result.reply()).contains("1 processed document(s)").contains("42.00").contains("USD");
    }

    @Test
    void chat_fallsBackToNoDataReply_whenBedrockFailsAndNothingUploadedYet() {
        when(tenantRepository.findById(tenantId)).thenReturn(java.util.Optional.of(new Tenant("Café Mocha")));
        when(analyticsService.overview(any(), any())).thenReturn(
                new FinancialOverview(BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, List.of(), List.of()));
        when(analyticsService.topMerchants(any(), any(), org.mockito.ArgumentMatchers.anyInt())).thenReturn(List.of());
        when(bedrockRuntimeClient.converse(any(ConverseRequest.class)))
                .thenThrow(SdkClientException.create("Bedrock unreachable"));
        when(extractedDataRepository.findByTenantId(org.mockito.ArgumentMatchers.eq(tenantId), any()))
                .thenReturn(Page.empty());

        ChatResponse result = aiCfoService.chat("How am I doing?", List.of());

        assertThat(result.reply()).contains("Upload a few receipts");
    }
}
