package com.akihlee.identity;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

/**
 * Issues and verifies the JWTs used to authenticate requests and identify
 * which tenant a request belongs to (see JwtAuthenticationFilter).
 */
@Component
public class JwtService {

    private final SecretKey key;
    private final long expirationMs;

    public JwtService(
            @Value("${jwt.secret}") String secret,
            @Value("${jwt.expiration-ms}") long expirationMs) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expirationMs = expirationMs;
    }

    public String generateToken(UUID userId, UUID tenantId, String email, UserRole role) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(userId.toString())
                .claim("tenantId", tenantId.toString())
                .claim("email", email)
                .claim("role", role.name())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusMillis(expirationMs)))
                .signWith(key)
                .compact();
    }

    public Claims parseClaims(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    private static final String OAUTH_STATE_PURPOSE = "oauth-state";
    private static final long OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

    /**
     * A short-lived, signed token used as an OAuth "state" parameter (e.g.
     * Square Connect) — binds the callback back to the tenant that started
     * the flow without requiring the browser to carry an Authorization
     * header on that redirect (it can't; it's a top-level navigation, not
     * an XHR). Reuses the same HMAC key as login JWTs since the trust
     * requirement is identical: only this server can produce a valid one.
     */
    public String generateStateToken(UUID tenantId) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(tenantId.toString())
                .claim("purpose", OAUTH_STATE_PURPOSE)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusMillis(OAUTH_STATE_TTL_MS)))
                .signWith(key)
                .compact();
    }

    /**
     * Verifies a state token and returns the tenant ID it was issued for.
     * Throws (via parseClaims/Jwts) if the signature or expiry is invalid,
     * and separately if it wasn't actually issued as an OAuth state token.
     */
    public UUID parseStateToken(String token) {
        Claims claims = parseClaims(token);
        if (!OAUTH_STATE_PURPOSE.equals(claims.get("purpose"))) {
            throw new IllegalArgumentException("Not an OAuth state token");
        }
        return UUID.fromString(claims.getSubject());
    }
}
