package com.akihlee.notifications;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class NotificationServiceTest {

    @Mock
    private NotificationRepository notificationRepository;

    @Mock
    private NotificationPreferenceRepository preferenceRepository;

    private NotificationService notificationService;
    private UUID tenantId;
    private UUID userId;

    @BeforeEach
    void setUp() {
        notificationService = new NotificationService(notificationRepository, preferenceRepository);
        tenantId = UUID.randomUUID();
        userId = UUID.randomUUID();
    }

    @Test
    void createNotification_persistsRow_evenWithNoPreferenceYet() {
        when(preferenceRepository.findByUserId(userId)).thenReturn(Optional.empty());
        when(preferenceRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Notification result = notificationService.createNotification(
                tenantId, userId, "Ready for review: Fresh Mart", "Extracted successfully.",
                NotificationType.INFO, UUID.randomUUID(), "{}");

        ArgumentCaptor<Notification> captor = ArgumentCaptor.forClass(Notification.class);
        verify(notificationRepository).save(captor.capture());
        assertThat(captor.getValue().getUserId()).isEqualTo(userId);
        assertThat(captor.getValue().getType()).isEqualTo(NotificationType.INFO);
        assertThat(result.getStatus()).isEqualTo(NotificationStatus.UNREAD);
    }

    @Test
    void list_unreadFilter_delegatesToUnreadQuery() {
        when(notificationRepository.findByUserIdAndStatusOrderByCreatedAtDesc(eq(userId), eq(NotificationStatus.UNREAD), any()))
                .thenReturn(List.of());

        notificationService.list(userId, "UNREAD", 50);

        verify(notificationRepository).findByUserIdAndStatusOrderByCreatedAtDesc(eq(userId), eq(NotificationStatus.UNREAD), any());
        verifyNoMoreInteractions(notificationRepository);
    }

    @Test
    void list_actionRequiredFilter_delegatesToTypeQuery() {
        when(notificationRepository.findByUserIdAndTypeOrderByCreatedAtDesc(eq(userId), eq(NotificationType.ACTION_REQUIRED), any()))
                .thenReturn(List.of());

        notificationService.list(userId, "ACTION_REQUIRED", 50);

        verify(notificationRepository).findByUserIdAndTypeOrderByCreatedAtDesc(eq(userId), eq(NotificationType.ACTION_REQUIRED), any());
    }

    @Test
    void markRead_returnsFalse_whenNotificationBelongsToAnotherUserOrDoesNotExist() {
        UUID notificationId = UUID.randomUUID();
        when(notificationRepository.findByIdAndUserId(notificationId, userId)).thenReturn(Optional.empty());

        boolean result = notificationService.markRead(notificationId, userId);

        assertThat(result).isFalse();
        verify(notificationRepository, never()).save(any());
    }

    @Test
    void preferencesFor_createsDefaultRow_whenNoneExists() {
        when(preferenceRepository.findByUserId(userId)).thenReturn(Optional.empty());
        when(preferenceRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        NotificationPreference result = notificationService.preferencesFor(userId);

        assertThat(result.isEmailEnabled()).isTrue();
        assertThat(result.isBatchDigestEnabled()).isTrue();
        assertThat(result.isInAppEnabled()).isTrue();
    }
}
