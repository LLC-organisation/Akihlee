package com.akihlee.finance.aicfo;

import java.util.UUID;

/** conversationId is null to start a new conversation. */
public record SendMessageRequest(UUID conversationId, String message) {
}
