package com.akihlee.identity;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * User Directory & Behavioral Analytics ("User CRM") for admins (see
 * SecurityConfig's /api/v1/admin/** gate) — inventory of every user across
 * every tenant, with engagement metrics reconstructed from audit_log
 * (what people did) and user_activity_pings (a presence heartbeat — see
 * UserActivityService for how "session" is approximated; there's no real
 * session start/end event in this stateless-JWT app).
 */
@RestController
@RequestMapping("/api/v1/admin/users")
public class AdminUserController {

    private static final List<String> DOCUMENT_UPLOAD_ACTIONS =
            List.of(AuditAction.DOCUMENT_UPLOAD, AuditAction.DOCUMENT_IMPORTED);

    private final UserRepository userRepository;
    private final TenantRepository tenantRepository;
    private final AuditLogRepository auditLogRepository;
    private final UserActivityService userActivityService;
    private final AuditLogService auditLogService;

    public AdminUserController(
            UserRepository userRepository,
            TenantRepository tenantRepository,
            AuditLogRepository auditLogRepository,
            UserActivityService userActivityService,
            AuditLogService auditLogService) {
        this.userRepository = userRepository;
        this.tenantRepository = tenantRepository;
        this.auditLogRepository = auditLogRepository;
        this.userActivityService = userActivityService;
        this.auditLogService = auditLogService;
    }

    @GetMapping
    public Page<UserDirectoryEntry> list(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) UUID tenantId,
            @RequestParam(required = false) UserRole role,
            @RequestParam(required = false) Integer days,
            @RequestParam(required = false, defaultValue = "lastActiveAt") String sortBy,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size) {
        List<UserDirectoryEntry> sorted = buildDirectoryEntries(search, tenantId, role, sinceFromDays(days)).stream()
                .sorted(sortComparator(sortBy))
                .toList();

        int from = Math.min(page * size, sorted.size());
        int to = Math.min(from + size, sorted.size());
        return new PageImpl<>(sorted.subList(from, to), PageRequest.of(page, size), sorted.size());
    }

    @GetMapping("/summary")
    public UserSummaryResponse summary(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) UUID tenantId,
            @RequestParam(required = false) UserRole role,
            @RequestParam(required = false) Integer days) {
        List<UserDirectoryEntry> all = buildDirectoryEntries(search, tenantId, role, sinceFromDays(days));
        Instant now = Instant.now();

        long dau = all.stream().filter(e -> withinLast(e.lastActiveAt(), now, Duration.ofHours(24))).count();
        long mau = all.stream().filter(e -> withinLast(e.lastActiveAt(), now, Duration.ofDays(30))).count();
        long atRisk = all.stream().filter(e -> e.status() == UserAccountStatus.AT_RISK).count();

        // Average of each user's own average session length — simpler than
        // pooling every individual session across every user, and a
        // reasonable enough proxy for a KPI header tile.
        List<Double> perUserAverages = all.stream()
                .map(UserDirectoryEntry::avgSessionDurationMinutes)
                .filter(Objects::nonNull)
                .toList();
        Double avgSession = perUserAverages.isEmpty()
                ? null
                : perUserAverages.stream().mapToDouble(d -> d).average().orElse(0);

        List<UserSummaryResponse.PowerUser> topPowerUsers = all.stream()
                .sorted(Comparator.comparingLong(UserDirectoryEntry::documentsProcessedTotal).reversed())
                .limit(5)
                .filter(e -> e.documentsProcessedTotal() > 0)
                .map(e -> new UserSummaryResponse.PowerUser(e.id(), e.email(), e.tenantBusinessName(), e.documentsProcessedTotal()))
                .toList();

        return new UserSummaryResponse(dau, mau, avgSession, topPowerUsers, atRisk, all.size());
    }

    @GetMapping("/{userId}")
    public UserDetailResponse detail(@PathVariable UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
        String tenantBusinessName = tenantRepository.findById(user.getTenantId())
                .map(Tenant::getBusinessName)
                .orElse(null);

        UserActivityService.SessionStats stats = userActivityService.sessionStats(userId);
        Instant lastLoginAt = auditLogRepository.findMaxCreatedAtByActorUserIdAndAction(userId, AuditAction.LOGIN_SUCCESS);
        Instant lastAuditActiveAt = auditLogRepository.findMaxCreatedAtByActorUserId(userId);
        Instant lastActiveAt = maxNullable(lastAuditActiveAt, stats.lastPingAt());
        UserAccountStatus status = UserAccountStatus.of(user.isActive(), lastActiveAt, Instant.now());

        long uploaded = countAny(userId, DOCUMENT_UPLOAD_ACTIONS);
        long approved = auditLogRepository.countByActorUserIdAndAction(userId, AuditAction.DOCUMENT_APPROVED);
        long rejected = auditLogRepository.countByActorUserIdAndAction(userId, AuditAction.DOCUMENT_REJECTED);
        long corrected = auditLogRepository.countByActorUserIdAndAction(userId, AuditAction.EXTRACTED_DATA_EDITED)
                + auditLogRepository.countByActorUserIdAndAction(userId, AuditAction.BANK_TRANSACTION_EDITED);
        UserDetailResponse.DocumentActivity documentActivity =
                new UserDetailResponse.DocumentActivity(uploaded, approved, rejected, corrected);

        Instant since = Instant.now().minus(84, ChronoUnit.DAYS); // 12 weeks
        List<UserDetailResponse.WeekPoint> weeklyTrend =
                bucketByWeek(auditLogRepository.findTimestampsSince(userId, since), since, Instant.now());

        Page<AuditLogEntry> recent = auditLogRepository.findByActorUserIdOrderByCreatedAtDesc(userId, PageRequest.of(0, 50));
        String lastKnownIp = recent.getContent().stream().map(AuditLogEntry::getIpAddress).filter(Objects::nonNull).findFirst().orElse(null);
        String lastKnownUserAgent = recent.getContent().stream().map(AuditLogEntry::getUserAgent).filter(Objects::nonNull).findFirst().orElse(null);
        List<UserDetailResponse.IpHistoryEntry> ipHistory = recent.getContent().stream()
                .filter(e -> e.getIpAddress() != null)
                .limit(10)
                .map(e -> new UserDetailResponse.IpHistoryEntry(e.getCreatedAt(), e.getIpAddress(), e.getUserAgent(), e.getAction()))
                .toList();

        return new UserDetailResponse(
                user.getId(), user.getTenantId(), tenantBusinessName, user.getEmail(), user.getRole(), status,
                user.getCreatedAt(), lastKnownIp, lastKnownUserAgent, lastLoginAt, lastActiveAt,
                stats.totalSessions(), stats.avgSessionDurationMinutes(), documentActivity, weeklyTrend, ipHistory);
    }

    /** This user's full timeline — "View in Audit Log" on the frontend deep-links the main audit log page to the same actor instead of duplicating filters here. */
    @GetMapping("/{userId}/activity")
    public Page<AuditLogEntry> activity(
            @PathVariable UUID userId,
            @PageableDefault(size = 25) Pageable pageable) {
        if (!userRepository.existsById(userId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found");
        }
        return auditLogRepository.findByActorUserIdOrderByCreatedAtDesc(userId, pageable);
    }

    @PatchMapping("/{userId}/status")
    public UserDetailResponse updateStatus(@PathVariable UUID userId, @RequestBody UpdateUserStatusRequest request) {
        UUID adminId = currentAdminId();
        if (userId.equals(adminId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "You can't change your own account status");
        }
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        if (request.active()) {
            user.reactivate();
        } else {
            user.suspend();
        }
        userRepository.save(user);

        String adminEmail = userRepository.findById(adminId).map(User::getEmail).orElse(null);
        auditLogService.log(user.getTenantId(), adminId, adminEmail,
                request.active() ? AuditAction.ACCOUNT_REACTIVATED : AuditAction.ACCOUNT_SUSPENDED,
                "USER", user.getId().toString(), user.getEmail());

        return detail(userId);
    }

    // since scopes the *volume* stats (documents processed) to a window —
    // "how much did they do in the last 30 days" — while lastLoginAt/
    // lastActiveAt/status stay all-time truths regardless of the window,
    // since "when did we last see them at all" is a different question
    // than "how active were they in this period".
    private List<UserDirectoryEntry> buildDirectoryEntries(String search, UUID tenantId, UserRole role, Instant since) {
        String searchPattern = search != null && !search.isBlank() ? "%" + search.toLowerCase() + "%" : null;
        List<UserRepository.UserDirectoryBaseRow> baseRows = userRepository.findDirectoryBaseRows(tenantId, role, searchPattern);
        if (baseRows.isEmpty()) {
            return List.of();
        }

        List<UUID> ids = baseRows.stream().map(UserRepository.UserDirectoryBaseRow::getId).toList();

        Map<UUID, Instant> lastLoginByUser = auditLogRepository.findMaxCreatedAtByActorUserIdInAndAction(ids, AuditAction.LOGIN_SUCCESS)
                .stream().collect(Collectors.toMap(AuditLogRepository.UserInstantRow::getUserId, AuditLogRepository.UserInstantRow::getLastAt));
        Map<UUID, Instant> lastAuditActiveByUser = auditLogRepository.findMaxCreatedAtByActorUserIdIn(ids)
                .stream().collect(Collectors.toMap(AuditLogRepository.UserInstantRow::getUserId, AuditLogRepository.UserInstantRow::getLastAt));

        List<String> countedActions = new ArrayList<>(DOCUMENT_UPLOAD_ACTIONS);
        countedActions.add(AuditAction.DOCUMENT_APPROVED);
        countedActions.add(AuditAction.DOCUMENT_REJECTED);
        Map<UUID, Map<String, Long>> docCountsByUser = new HashMap<>();
        for (AuditLogRepository.UserActionCountRow row : auditLogRepository.countByActorUserIdInAndActionInSince(ids, countedActions, since)) {
            docCountsByUser.computeIfAbsent(row.getUserId(), k -> new HashMap<>()).put(row.getAction(), row.getCnt());
        }

        Map<UUID, UserActivityService.SessionStats> sessionStatsByUser = userActivityService.sessionStatsForUsers(ids);

        Instant now = Instant.now();
        List<UserDirectoryEntry> entries = new ArrayList<>();
        for (UserRepository.UserDirectoryBaseRow row : baseRows) {
            UUID id = row.getId();
            Map<String, Long> docCounts = docCountsByUser.getOrDefault(id, Map.of());
            long uploaded = DOCUMENT_UPLOAD_ACTIONS.stream().mapToLong(a -> docCounts.getOrDefault(a, 0L)).sum();
            long approved = docCounts.getOrDefault(AuditAction.DOCUMENT_APPROVED, 0L);
            long rejected = docCounts.getOrDefault(AuditAction.DOCUMENT_REJECTED, 0L);

            UserActivityService.SessionStats stats = sessionStatsByUser.getOrDefault(id, new UserActivityService.SessionStats(0, null, null));
            Instant lastActiveAt = maxNullable(lastAuditActiveByUser.get(id), stats.lastPingAt());

            entries.add(new UserDirectoryEntry(
                    id, row.getTenantId(), row.getTenantBusinessName(), row.getEmail(), row.getRole(),
                    UserAccountStatus.of(row.getActiveFlag(), lastActiveAt, now),
                    row.getCreatedAt(), lastLoginByUser.get(id), lastActiveAt,
                    stats.totalSessions(), stats.avgSessionDurationMinutes(),
                    uploaded, approved, rejected, uploaded + approved + rejected));
        }
        return entries;
    }

    private long countAny(UUID userId, List<String> actions) {
        long total = 0;
        for (String action : actions) {
            total += auditLogRepository.countByActorUserIdAndAction(userId, action);
        }
        return total;
    }

    private static Comparator<UserDirectoryEntry> sortComparator(String sortBy) {
        if ("documentsProcessed".equals(sortBy)) {
            return Comparator.comparingLong(UserDirectoryEntry::documentsProcessedTotal).reversed();
        }
        return Comparator.comparing(
                UserDirectoryEntry::lastActiveAt, Comparator.nullsLast(Comparator.naturalOrder())).reversed();
    }

    private static boolean withinLast(Instant at, Instant now, Duration window) {
        return at != null && Duration.between(at, now).compareTo(window) <= 0;
    }

    private static Instant sinceFromDays(Integer days) {
        return days != null ? Instant.now().minus(days, ChronoUnit.DAYS) : null;
    }

    private static Instant maxNullable(Instant a, Instant b) {
        if (a == null) return b;
        if (b == null) return a;
        return a.isAfter(b) ? a : b;
    }

    private List<UserDetailResponse.WeekPoint> bucketByWeek(List<Instant> timestamps, Instant since, Instant until) {
        Map<LocalDate, Long> counts = new HashMap<>();
        for (Instant ts : timestamps) {
            LocalDate weekStart = ts.atZone(ZoneOffset.UTC).toLocalDate().with(DayOfWeek.MONDAY);
            counts.merge(weekStart, 1L, Long::sum);
        }
        LocalDate cursor = since.atZone(ZoneOffset.UTC).toLocalDate().with(DayOfWeek.MONDAY);
        LocalDate end = until.atZone(ZoneOffset.UTC).toLocalDate().with(DayOfWeek.MONDAY);
        List<UserDetailResponse.WeekPoint> result = new ArrayList<>();
        while (!cursor.isAfter(end)) {
            result.add(new UserDetailResponse.WeekPoint(cursor.toString(), counts.getOrDefault(cursor, 0L)));
            cursor = cursor.plusWeeks(1);
        }
        return result;
    }

    private UUID currentAdminId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
