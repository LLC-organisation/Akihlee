package com.akihlee.notifications;

import com.akihlee.documents.Document;
import com.akihlee.documents.DocumentExtractionCompletedEvent;
import com.akihlee.identity.User;
import com.akihlee.identity.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DocumentExtractionListenerTest {

    @Mock
    private NotificationService notificationService;

    @Mock
    private UserRepository userRepository;

    private DocumentExtractionListener listener;
    private UUID tenantId;
    private UUID documentId;
    private User recipient;

    @BeforeEach
    void setUp() {
        listener = new DocumentExtractionListener(notificationService, userRepository, new ObjectMapper());
        tenantId = UUID.randomUUID();
        documentId = UUID.randomUUID();
        recipient = new User(tenantId, "owner@example.com", "hash");
        when(userRepository.findByTenantIdAndActiveTrue(tenantId)).thenReturn(List.of(recipient));
    }

    @Test
    void reviewRequired_createsActionRequiredNotification() {
        var event = new DocumentExtractionCompletedEvent(
                documentId, tenantId, Document.DocumentStatus.REVIEW_REQUIRED, 0.55,
                List.of(), "Fresh Mart Grocers", new BigDecimal("42.00"));

        listener.onDocumentExtractionCompleted(event);

        verify(notificationService).createNotification(
                any(), any(), any(), any(), org.mockito.ArgumentMatchers.eq(NotificationType.ACTION_REQUIRED), any(), any());
    }

    @Test
    void extractedWithMissingFields_isStillActionRequired() {
        var event = new DocumentExtractionCompletedEvent(
                documentId, tenantId, Document.DocumentStatus.EXTRACTED, 0.95,
                List.of("Amount"), "Fresh Mart Grocers", null);

        listener.onDocumentExtractionCompleted(event);

        ArgumentCaptor<NotificationType> typeCaptor = ArgumentCaptor.forClass(NotificationType.class);
        verify(notificationService).createNotification(
                any(), any(), any(), any(), typeCaptor.capture(), any(), any());
        assertThat(typeCaptor.getValue()).isEqualTo(NotificationType.ACTION_REQUIRED);
    }

    @Test
    void extractedFullyPopulated_isInfoOnly() {
        var event = new DocumentExtractionCompletedEvent(
                documentId, tenantId, Document.DocumentStatus.EXTRACTED, 0.97,
                List.of(), "Fresh Mart Grocers", new BigDecimal("42.00"));

        listener.onDocumentExtractionCompleted(event);

        ArgumentCaptor<NotificationType> typeCaptor = ArgumentCaptor.forClass(NotificationType.class);
        verify(notificationService).createNotification(
                any(), any(), any(), any(), typeCaptor.capture(), any(), any());
        assertThat(typeCaptor.getValue()).isEqualTo(NotificationType.INFO);
    }

    @Test
    void fanOutsOneNotificationPerActiveTenantUser() {
        User secondUser = new User(tenantId, "staff@example.com", "hash");
        when(userRepository.findByTenantIdAndActiveTrue(tenantId)).thenReturn(List.of(recipient, secondUser));
        var event = new DocumentExtractionCompletedEvent(
                documentId, tenantId, Document.DocumentStatus.EXTRACTED, 0.97,
                List.of(), "Fresh Mart Grocers", new BigDecimal("42.00"));

        listener.onDocumentExtractionCompleted(event);

        verify(notificationService, org.mockito.Mockito.times(2)).createNotification(
                any(), any(), any(), any(), any(), any(), any());
    }
}
