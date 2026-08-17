package com.akihlee.finance.aicfo;

/** One prior turn of the AI CFO conversation, as held in the frontend's own message history. */
public record ChatTurn(String role, String text) {
}
