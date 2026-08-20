package com.akihlee.finance.aicfo;

import java.time.Instant;
import java.util.UUID;

public record ConversationSummary(UUID id, String title, Instant createdAt, Instant updatedAt) {

    static ConversationSummary from(AiCfoConversation conversation) {
        return new ConversationSummary(
                conversation.getId(), conversation.getTitle(), conversation.getCreatedAt(), conversation.getUpdatedAt());
    }
}
