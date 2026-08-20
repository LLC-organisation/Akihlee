package com.akihlee.finance.aicfo;

import java.util.UUID;

public record SendMessageResponse(UUID conversationId, String title, String reply) {
}
