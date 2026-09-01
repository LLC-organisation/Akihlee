package com.akihlee.qbquickstart.oauth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.springframework.stereotype.Component;

import java.io.File;
import java.io.IOException;
import java.time.Instant;

/**
 * Local, single-tenant token storage for this quickstart: holds the current
 * access/refresh token pair in memory and mirrors it to a JSON file on disk
 * so a restart doesn't force you back through Step 1-2. This is deliberately
 * simple (one global slot, a flat file) because this app has exactly one
 * QuickBooks sandbox company connected at a time — a real multi-tenant app
 * needs this keyed by user/tenant and stored in a real database, with the
 * file swapped for something encrypted at rest.
 */
@Component
public class TokenStore {

    private static final ObjectMapper MAPPER = new ObjectMapper()
            .registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
            .enable(SerializationFeature.INDENT_OUTPUT);

    private final File file;
    private volatile StoredTokens current;

    public TokenStore(QuickBooksProperties properties) {
        this.file = new File(properties.tokenStorePath());
        this.current = load();
    }

    public synchronized void save(String accessToken, String refreshToken, String realmId,
                                   long expiresInSeconds, long refreshTokenExpiresInSeconds) {
        Instant now = Instant.now();
        this.current = new StoredTokens(
                accessToken,
                refreshToken,
                realmId,
                now.plusSeconds(expiresInSeconds),
                now.plusSeconds(refreshTokenExpiresInSeconds)
        );
        persist();
    }

    /** Same access token, rotated refresh token + expiries — used after a refresh call. */
    public synchronized void updateAfterRefresh(String accessToken, String refreshToken,
                                                 long expiresInSeconds, long refreshTokenExpiresInSeconds) {
        if (current == null) {
            throw new IllegalStateException("No stored tokens to refresh — run Step 1/2 first.");
        }
        Instant now = Instant.now();
        this.current = new StoredTokens(
                accessToken,
                refreshToken,
                current.realmId(),
                now.plusSeconds(expiresInSeconds),
                now.plusSeconds(refreshTokenExpiresInSeconds)
        );
        persist();
    }

    public synchronized void clear() {
        this.current = null;
        if (file.exists() && !file.delete()) {
            throw new IllegalStateException("Could not delete " + file.getAbsolutePath());
        }
    }

    public StoredTokens current() {
        return current;
    }

    public boolean isConnected() {
        return current != null;
    }

    /** True once we're within 60s of expiry (or already past it) — refresh proactively, not reactively. */
    public boolean accessTokenNeedsRefresh() {
        return current == null || Instant.now().isAfter(current.accessTokenExpiresAt().minusSeconds(60));
    }

    private StoredTokens load() {
        if (!file.exists()) {
            return null;
        }
        try {
            return MAPPER.readValue(file, StoredTokens.class);
        } catch (IOException e) {
            throw new IllegalStateException("Could not read " + file.getAbsolutePath() + " — delete it and reconnect.", e);
        }
    }

    private void persist() {
        try {
            MAPPER.writeValue(file, current);
        } catch (IOException e) {
            throw new IllegalStateException("Could not write " + file.getAbsolutePath(), e);
        }
    }

    public record StoredTokens(
            String accessToken,
            String refreshToken,
            String realmId,
            Instant accessTokenExpiresAt,
            Instant refreshTokenExpiresAt
    ) {
    }
}
