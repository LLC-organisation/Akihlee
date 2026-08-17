package com.akihlee.documents;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * Published once OCR extraction finishes and a document's status has been
 * set to EXTRACTED or REVIEW_REQUIRED, so modules that don't (and
 * shouldn't) depend on documents' internals — like the notifications
 * module — can react without a direct compile-time dependency in this
 * direction. Mirrors WhatsAppNumberConnectedEvent's placement in the
 * producing module (identity), one level up the dependency chain
 * (documents -> notifications).
 */
public record DocumentExtractionCompletedEvent(
        UUID documentId,
        UUID tenantId,
        Document.DocumentStatus status,
        double confidence,
        List<String> missingFields,
        String merchantName,
        BigDecimal totalAmount) {
}
