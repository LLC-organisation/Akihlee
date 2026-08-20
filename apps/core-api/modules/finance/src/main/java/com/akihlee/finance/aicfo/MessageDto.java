package com.akihlee.finance.aicfo;

import java.time.Instant;

/** role is lowercased ("user"/"assistant") to match the frontend's existing ChatMessage/ChatTurn convention. */
public record MessageDto(String role, String text, Instant createdAt) {

    static MessageDto from(AiCfoMessage message) {
        return new MessageDto(message.getRole().name().toLowerCase(), message.getContent(), message.getCreatedAt());
    }
}
