package com.akihlee.finance.integrations.square;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/integrations/square")
public class SquareIntegrationController {

    private final SquareSyncService squareSyncService;
    private final String accessToken;

    public SquareIntegrationController(SquareSyncService squareSyncService,
                                       @Value("${square.access-token}") String accessToken) {
        this.squareSyncService = squareSyncService;
        this.accessToken = accessToken;
    }

    /**
     * Manually triggers a sync of the last 30 days of Square payments for
     * the current tenant. Fixed window, no "since last sync" cursor — the
     * existing idempotency check (SquareTransaction.externalId) means a
     * repeat sync just costs a wasted Square API call, not duplicate data.
     */
    @PostMapping("/sync")
    public ResponseEntity<Map<String, Object>> sync() {
        if (accessToken == null || accessToken.isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Square is not configured. Set SQUARE_ACCESS_TOKEN."));
        }

        Instant end = Instant.now();
        Instant start = end.minus(30, ChronoUnit.DAYS);
        int imported = squareSyncService.syncTransactions(start, end);
        return ResponseEntity.ok(Map.of("imported", imported));
    }
}
