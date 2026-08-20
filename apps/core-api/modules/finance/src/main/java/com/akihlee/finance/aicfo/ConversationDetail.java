package com.akihlee.finance.aicfo;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record ConversationDetail(UUID id, String title, Instant createdAt, List<MessageDto> messages) {
}
