package com.akihlee.identity;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Approximates "session" activity for the admin User CRM (see
 * AdminUserController) from {@link UserActivityPing} rows — the closest
 * thing this stateless-JWT app has to a heartbeat. There's no logout or
 * expiry event to mark a session's real end, so a "session" here is
 * reconstructed by bucketing a user's pings: a gap of more than
 * {@link #SESSION_GAP} between two consecutive pings starts a new session,
 * and a session's duration is (last ping - first ping) within that run.
 * A single-ping run has no measurable duration (we genuinely don't know
 * how long they stayed) and is excluded from the average rather than
 * counted as zero.
 *
 * This is a real, if approximate, presence signal — not a fabricated one —
 * but it undercounts pre-existing users who haven't made a request since
 * this feature shipped (zero pings yet). Callers should treat a null
 * avgSessionDurationMinutes as "not enough data", not "zero".
 */
@Service
public class UserActivityService {

    private static final Logger logger = LoggerFactory.getLogger(UserActivityService.class);

    private static final Duration SESSION_GAP = Duration.ofMinutes(30);

    // Throttle so a busy user doesn't write a ping on every single request —
    // one row per (roughly) 5 minutes of continuous use is plenty of
    // resolution for session bucketing. In-memory rather than a DB check:
    // under horizontal scaling (multiple Cloud Run instances) each instance
    // throttles independently, so a handful of extra rows can slip through
    // across instance boundaries — harmless (bucketing still works, just
    // marginally more storage), and far cheaper than a DB read on every
    // authenticated request just to decide whether to skip a write.
    private static final Duration PING_THROTTLE = Duration.ofMinutes(5);
    private final Map<UUID, Instant> lastPingAt = new ConcurrentHashMap<>();

    private final UserActivityPingRepository pingRepository;

    public UserActivityService(UserActivityPingRepository pingRepository) {
        this.pingRepository = pingRepository;
    }

    /** Never lets a logging failure break the request — see AuditLogService for the same tradeoff. */
    public void recordPing(UUID userId, UUID tenantId) {
        try {
            Instant now = Instant.now();
            Instant last = lastPingAt.get(userId);
            if (last != null && Duration.between(last, now).compareTo(PING_THROTTLE) < 0) {
                return;
            }
            lastPingAt.put(userId, now);
            pingRepository.save(new UserActivityPing(userId, tenantId));
        } catch (Exception e) {
            logger.warn("Failed to record activity ping for user {}", userId, e);
        }
    }

    public SessionStats sessionStats(UUID userId) {
        return bucketSessions(pingRepository.findTimestampsForUser(userId));
    }

    public Map<UUID, SessionStats> sessionStatsForUsers(List<UUID> userIds) {
        if (userIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, List<Instant>> byUser = new java.util.LinkedHashMap<>();
        for (UserActivityPingRepository.PingRow row : pingRepository.findTimestampsForUsers(userIds)) {
            byUser.computeIfAbsent(row.getUserId(), k -> new ArrayList<>()).add(row.getCreatedAt());
        }
        Map<UUID, SessionStats> result = new java.util.LinkedHashMap<>();
        for (UUID userId : userIds) {
            result.put(userId, bucketSessions(byUser.getOrDefault(userId, List.of())));
        }
        return result;
    }

    private SessionStats bucketSessions(List<Instant> timestampsAsc) {
        if (timestampsAsc.isEmpty()) {
            return new SessionStats(0, null, null);
        }

        int totalSessions = 1;
        Instant sessionStart = timestampsAsc.get(0);
        Instant prev = timestampsAsc.get(0);
        List<Duration> measuredDurations = new ArrayList<>();

        for (int i = 1; i < timestampsAsc.size(); i++) {
            Instant current = timestampsAsc.get(i);
            if (Duration.between(prev, current).compareTo(SESSION_GAP) > 0) {
                if (!prev.equals(sessionStart)) {
                    measuredDurations.add(Duration.between(sessionStart, prev));
                }
                totalSessions++;
                sessionStart = current;
            }
            prev = current;
        }
        if (!prev.equals(sessionStart)) {
            measuredDurations.add(Duration.between(sessionStart, prev));
        }

        Double avgMinutes = measuredDurations.isEmpty()
                ? null
                : measuredDurations.stream().mapToLong(Duration::toSeconds).average().orElse(0) / 60.0;

        return new SessionStats(totalSessions, avgMinutes, timestampsAsc.get(timestampsAsc.size() - 1));
    }

    public record SessionStats(int totalSessions, Double avgSessionDurationMinutes, Instant lastPingAt) {
    }
}
