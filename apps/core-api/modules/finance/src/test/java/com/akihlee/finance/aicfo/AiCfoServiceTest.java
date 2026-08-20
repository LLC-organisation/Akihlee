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
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.web.server.ResponseStatusException;
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
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
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
    private AiCfoConversationRepository conversationRepository;

    @Mock
    private AiCfoMessageRepository messageRepository;

    @Mock
    private BedrockRuntimeClient bedrockRuntimeClient;

    private UUID tenantId;
    private UUID userId;

    @BeforeEach
    void setUp() {
        tenantId = UUID.randomUUID();
        userId = UUID.randomUUID();
        TenantContext.setCurrentTenantId(tenantId);
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    private AiCfoService newService(String guardrailId, String guardrailVersion) {
        return new AiCfoService(
                analyticsService, tenantRepository, extractedDataRepository,
                conversationRepository, messageRepository, bedrockRuntimeClient,
                "us.anthropic.claude-sonnet-4-5-20250929-v1:0", guardrailId, guardrailVersion);
    }

    private void stubGrounding() {
        when(tenantRepository.findById(tenantId)).thenReturn(Optional.of(new Tenant("Café Mocha")));
        when(analyticsService.overview(any(), any())).thenReturn(
                new FinancialOverview(BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, List.of(), List.of()));
        when(analyticsService.topMerchants(any(), any(), anyInt())).thenReturn(List.of());
    }

    private static ConverseResponse textResponse(String text) {
        return ConverseResponse.builder()
                .output(ConverseOutput.fromMessage(Message.builder()
                        .role(ConversationRole.ASSISTANT)
                        .content(List.of(ContentBlock.fromText(text)))
                        .build()))
                .build();
    }

    @Test
    void chat_returnsBedrockReply_whenCallSucceeds() {
        stubGrounding();
        when(bedrockRuntimeClient.converse(any(ConverseRequest.class))).thenReturn(textResponse("Your top expense is rent."));

        ChatResponse result = newService(null, null).chat("What are my top expenses?", List.of());

        assertThat(result.reply()).isEqualTo("Your top expense is rent.");
    }

    @Test
    void chat_fallsBackToCannedReply_whenBedrockCallFails() {
        stubGrounding();
        when(bedrockRuntimeClient.converse(any(ConverseRequest.class)))
                .thenThrow(SdkClientException.create("Bedrock unreachable"));

        ExtractedData data = new ExtractedData(UUID.randomUUID(), tenantId, "receipt.pdf");
        data.setTotalAmount(new BigDecimal("42.00"));
        data.setCurrency("USD");
        when(extractedDataRepository.findByTenantId(eq(tenantId), any())).thenReturn(new PageImpl<>(List.of(data)));

        ChatResponse result = newService(null, null).chat("What are my top expenses?", List.of());

        assertThat(result.reply()).contains("1 processed document(s)").contains("42.00").contains("USD");
    }

    @Test
    void chat_fallsBackToNoDataReply_whenBedrockFailsAndNothingUploadedYet() {
        stubGrounding();
        when(bedrockRuntimeClient.converse(any(ConverseRequest.class)))
                .thenThrow(SdkClientException.create("Bedrock unreachable"));
        when(extractedDataRepository.findByTenantId(eq(tenantId), any())).thenReturn(Page.empty());

        ChatResponse result = newService(null, null).chat("How am I doing?", List.of());

        assertThat(result.reply()).contains("Upload a few receipts");
    }

    @Test
    void callBedrock_attachesGuardrailConfig_whenGuardrailIdConfigured() {
        stubGrounding();
        when(bedrockRuntimeClient.converse(any(ConverseRequest.class))).thenReturn(textResponse("reply"));

        newService("st8gvnhjskv9", "1").chat("What are my top expenses?", List.of());

        ArgumentCaptor<ConverseRequest> captor = ArgumentCaptor.forClass(ConverseRequest.class);
        verify(bedrockRuntimeClient).converse(captor.capture());
        assertThat(captor.getValue().guardrailConfig()).isNotNull();
        assertThat(captor.getValue().guardrailConfig().guardrailIdentifier()).isEqualTo("st8gvnhjskv9");
        assertThat(captor.getValue().guardrailConfig().guardrailVersion()).isEqualTo("1");
    }

    @Test
    void callBedrock_omitsGuardrailConfig_whenGuardrailIdBlank() {
        stubGrounding();
        when(bedrockRuntimeClient.converse(any(ConverseRequest.class))).thenReturn(textResponse("reply"));

        newService("", "").chat("What are my top expenses?", List.of());

        ArgumentCaptor<ConverseRequest> captor = ArgumentCaptor.forClass(ConverseRequest.class);
        verify(bedrockRuntimeClient).converse(captor.capture());
        assertThat(captor.getValue().guardrailConfig()).isNull();
    }

    @Test
    void sendConversationMessage_createsConversationAndGeneratesTitle_onFirstMessage() {
        stubGrounding();
        when(conversationRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(messageRepository.findByConversationIdOrderByCreatedAtAsc(any())).thenReturn(List.of());
        when(bedrockRuntimeClient.converse(any(ConverseRequest.class)))
                .thenReturn(textResponse("Your rent is your biggest expense."))
                .thenReturn(textResponse("Rent Expense Overview"));

        SendMessageResponse result = newService(null, null)
                .sendConversationMessage(userId, null, "What's my biggest expense?");

        assertThat(result.reply()).isEqualTo("Your rent is your biggest expense.");
        assertThat(result.title()).isEqualTo("Rent Expense Overview");
        verify(messageRepository, times(2)).save(any());
        verify(bedrockRuntimeClient, times(2)).converse(any(ConverseRequest.class));
    }

    @Test
    void sendConversationMessage_fallsBackToTruncatedTitle_whenTitleGenerationFails() {
        stubGrounding();
        when(conversationRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(messageRepository.findByConversationIdOrderByCreatedAtAsc(any())).thenReturn(List.of());
        when(bedrockRuntimeClient.converse(any(ConverseRequest.class)))
                .thenReturn(textResponse("Your rent is your biggest expense."))
                .thenThrow(SdkClientException.create("title generation failed"));

        SendMessageResponse result = newService(null, null)
                .sendConversationMessage(userId, null, "What's my biggest expense this quarter?");

        assertThat(result.title()).isEqualTo("What's my biggest expense this quarter?");
    }

    @Test
    void sendConversationMessage_doesNotRegenerateTitle_onExistingConversation() {
        stubGrounding();
        UUID conversationId = UUID.randomUUID();
        AiCfoConversation existing = new AiCfoConversation(tenantId, userId, "Existing Title");
        // AiCfoConversation.id is only ever assigned by Hibernate on real
        // persistence (@GeneratedValue) — constructing it directly here
        // leaves it null, so set it via reflection to simulate a row
        // actually loaded from the DB with the id the mock returns.
        org.springframework.test.util.ReflectionTestUtils.setField(existing, "id", conversationId);
        when(conversationRepository.findByIdAndUserId(conversationId, userId)).thenReturn(Optional.of(existing));
        when(conversationRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(messageRepository.findByConversationIdOrderByCreatedAtAsc(conversationId)).thenReturn(List.of());
        when(bedrockRuntimeClient.converse(any(ConverseRequest.class))).thenReturn(textResponse("Follow-up answer."));

        SendMessageResponse result = newService(null, null)
                .sendConversationMessage(userId, conversationId, "And what about last month?");

        assertThat(result.title()).isEqualTo("Existing Title");
        verify(bedrockRuntimeClient, times(1)).converse(any(ConverseRequest.class)); // no extra title-gen call
    }

    @Test
    void sendConversationMessage_throwsNotFound_whenConversationDoesNotBelongToUser() {
        UUID conversationId = UUID.randomUUID();
        when(conversationRepository.findByIdAndUserId(conversationId, userId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> newService(null, null).sendConversationMessage(userId, conversationId, "hi"))
                .isInstanceOf(ResponseStatusException.class);

        verify(bedrockRuntimeClient, never()).converse(any(ConverseRequest.class));
    }

    @Test
    void getConversation_throwsNotFound_whenNotOwnedByUser() {
        UUID conversationId = UUID.randomUUID();
        when(conversationRepository.findByIdAndUserId(conversationId, userId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> newService(null, null).getConversation(userId, conversationId))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void listConversations_mapsRepositoryResultsToSummaries() {
        AiCfoConversation conversation = new AiCfoConversation(tenantId, userId, "My Chat");
        when(conversationRepository.findByUserIdOrderByUpdatedAtDesc(eq(userId), any()))
                .thenReturn(List.of(conversation));

        List<ConversationSummary> result = newService(null, null).listConversations(userId);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).title()).isEqualTo("My Chat");
    }
}
