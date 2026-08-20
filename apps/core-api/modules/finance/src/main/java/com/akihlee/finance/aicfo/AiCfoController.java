package com.akihlee.finance.aicfo;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/ai-cfo")
public class AiCfoController {

    // Cheap, pre-Bedrock-call defense against an oversized/abusive request
    // (OWASP LLM04 — model denial of service) — generous for a real
    // financial question, bounded against abuse.
    private static final int MAX_MESSAGE_LENGTH = 4000;

    private final AiCfoService aiCfoService;

    public AiCfoController(AiCfoService aiCfoService) {
        this.aiCfoService = aiCfoService;
    }

    /** Stateless — used by the quick-chat widget on Dashboard/Analytics. */
    @PostMapping("/chat")
    public ChatResponse chat(@RequestBody ChatRequest request) {
        validateMessage(request.message());
        return aiCfoService.chat(request.message(), request.history());
    }

    @GetMapping("/conversations")
    public List<ConversationSummary> listConversations() {
        return aiCfoService.listConversations(currentUserId());
    }

    @GetMapping("/conversations/{id}")
    public ConversationDetail getConversation(@PathVariable UUID id) {
        return aiCfoService.getConversation(currentUserId(), id);
    }

    /** Persisted — used by the full /ai-cfo page. conversationId null in the body starts a new conversation. */
    @PostMapping("/conversations/messages")
    public SendMessageResponse sendConversationMessage(@RequestBody SendMessageRequest request) {
        validateMessage(request.message());
        return aiCfoService.sendConversationMessage(currentUserId(), request.conversationId(), request.message());
    }

    private static void validateMessage(String message) {
        if (message == null || message.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Message cannot be empty.");
        }
        if (message.length() > MAX_MESSAGE_LENGTH) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Message is too long (max " + MAX_MESSAGE_LENGTH + " characters).");
        }
    }

    private static UUID currentUserId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
