package com.akihlee.finance.aicfo;

import java.util.List;

public record ChatRequest(String message, List<ChatTurn> history) {
}
