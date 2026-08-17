package com.akihlee.notifications;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/notifications")
public class NotificationController {

    private final NotificationService notificationService;

    public NotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @GetMapping
    public List<Notification> list(
            @RequestParam(defaultValue = "ALL") String status,
            @RequestParam(defaultValue = "50") int limit) {
        return notificationService.list(currentUserId(), status, limit);
    }

    @GetMapping("/unread-count")
    public UnreadCountResponse unreadCount() {
        return new UnreadCountResponse(notificationService.unreadCount(currentUserId()));
    }

    @PostMapping("/{id}/read")
    public ResponseEntity<Void> markRead(@PathVariable UUID id) {
        boolean found = notificationService.markRead(id, currentUserId());
        if (!found) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Notification not found");
        }
        return ResponseEntity.ok().build();
    }

    @PostMapping("/read-all")
    public ResponseEntity<Void> markAllRead() {
        notificationService.markAllRead(currentUserId());
        return ResponseEntity.ok().build();
    }

    @GetMapping("/preferences")
    public NotificationPreference getPreferences() {
        return notificationService.preferencesFor(currentUserId());
    }

    @PutMapping("/preferences")
    public NotificationPreference updatePreferences(@RequestBody UpdatePreferencesRequest request) {
        return notificationService.updatePreferences(
                currentUserId(), request.emailEnabled(), request.batchDigestEnabled(), request.inAppEnabled());
    }

    private UUID currentUserId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }

    public record UnreadCountResponse(long count) {
    }

    public record UpdatePreferencesRequest(boolean emailEnabled, boolean batchDigestEnabled, boolean inAppEnabled) {
    }
}
