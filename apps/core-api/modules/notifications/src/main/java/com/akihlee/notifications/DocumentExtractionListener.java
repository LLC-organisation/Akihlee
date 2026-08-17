package com.akihlee.notifications;

import com.akihlee.documents.Document;
import com.akihlee.documents.DocumentExtractionCompletedEvent;
import com.akihlee.identity.User;
import com.akihlee.identity.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * Turns OCR completion into an in-app notification for every active user in
 * the tenant. A document flagged REVIEW_REQUIRED, or one missing a required
 * field (Amount/Date) even though the worker considered it EXTRACTED, is
 * raised as ACTION_REQUIRED — this doubles as the "Low-Confidence / Manual
 * Review Alert" from the notification spec, since it's the same signal
 * document-worker already computed to decide EXTRACTED vs REVIEW_REQUIRED.
 *
 * Plain @EventListener (not @TransactionalEventListener), matching
 * WhatsAppConnectionListener's synchronous, same-thread-as-publisher style.
 */
@Component
public class DocumentExtractionListener {

    private final NotificationService notificationService;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;

    public DocumentExtractionListener(
            NotificationService notificationService, UserRepository userRepository, ObjectMapper objectMapper) {
        this.notificationService = notificationService;
        this.userRepository = userRepository;
        this.objectMapper = objectMapper;
    }

    @EventListener
    public void onDocumentExtractionCompleted(DocumentExtractionCompletedEvent event) {
        boolean needsReview = event.status() == Document.DocumentStatus.REVIEW_REQUIRED
                || !event.missingFields().isEmpty();

        String merchant = event.merchantName() != null && !event.merchantName().isBlank()
                ? event.merchantName()
                : "A document";

        String title = needsReview ? "Needs your review: " + merchant : "Ready for review: " + merchant;
        String message = needsReview
                ? buildReviewMessage(event)
                : merchant + " was extracted successfully and is ready to approve.";
        NotificationType type = needsReview ? NotificationType.ACTION_REQUIRED : NotificationType.INFO;
        String metadata = toJson(Map.of(
                "confidence", event.confidence(),
                "missingFields", event.missingFields(),
                "totalAmount", event.totalAmount() != null ? event.totalAmount().toString() : ""));

        List<User> recipients = userRepository.findByTenantIdAndActiveTrue(event.tenantId());
        for (User recipient : recipients) {
            notificationService.createNotification(
                    event.tenantId(), recipient.getId(), title, message, type, event.documentId(), metadata);
        }
    }

    private String buildReviewMessage(DocumentExtractionCompletedEvent event) {
        if (!event.missingFields().isEmpty()) {
            return "Missing " + String.join(" and ", event.missingFields()) + " — needs manual review before it can be approved.";
        }
        return String.format("OCR confidence was low (%.0f%%) — needs manual review before it can be approved.",
                event.confidence() * 100);
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            return "{}";
        }
    }
}
