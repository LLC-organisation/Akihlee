package com.akihlee.finance.aicfo;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class AiCfoControllerTest {

    @Mock
    private AiCfoService aiCfoService;

    @Test
    void chat_rejectsBlankMessage() {
        AiCfoController controller = new AiCfoController(aiCfoService);

        assertThatThrownBy(() -> controller.chat(new ChatRequest("   ", List.of())))
                .isInstanceOf(ResponseStatusException.class);

        verify(aiCfoService, never()).chat(any(), any());
    }

    @Test
    void chat_rejectsMessageOverMaxLength() {
        AiCfoController controller = new AiCfoController(aiCfoService);
        String tooLong = "a".repeat(4001);

        assertThatThrownBy(() -> controller.chat(new ChatRequest(tooLong, List.of())))
                .isInstanceOf(ResponseStatusException.class);

        verify(aiCfoService, never()).chat(any(), any());
    }

    @Test
    void chat_acceptsMessageAtMaxLength() {
        AiCfoController controller = new AiCfoController(aiCfoService);
        String atLimit = "a".repeat(4000);

        controller.chat(new ChatRequest(atLimit, List.of()));

        verify(aiCfoService).chat(any(), any());
    }

    @Test
    void sendConversationMessage_rejectsOversizedMessage() {
        AiCfoController controller = new AiCfoController(aiCfoService);
        String tooLong = "a".repeat(4001);

        assertThatThrownBy(() -> controller.sendConversationMessage(new SendMessageRequest(null, tooLong)))
                .isInstanceOf(ResponseStatusException.class);

        verify(aiCfoService, never()).sendConversationMessage(any(), any(), any());
    }
}
