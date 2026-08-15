package com.akihlee.identity;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Repository
public interface AuditLogRepository extends JpaRepository<AuditLogEntry, UUID> {

    // actorEmailPattern is a pre-built "%...%" LIKE pattern (or null), built
    // in the controller rather than concatenated here — concatenating a
    // possibly-null bound parameter with || makes Postgres's overload
    // resolution for || ambiguous (it can pick the bytea overload instead of
    // text for an untyped null), which threw "function lower(bytea) does
    // not exist" even though actor_email is plain VARCHAR(255).
    //
    // from/to are explicitly CAST to timestamp: an Instant param whose only
    // other appearance is "IS NULL" gives Postgres no type context to infer
    // from (unlike the String/UUID params above, which Postgres defaults to
    // text/uuid), so it threw "could not determine data type of parameter"
    // (42P18) whenever from/to were supplied.
    // qPattern is a free-text "%...%" pattern (or null), matched the same
    // way actorEmailPattern is — against whatever metadata the event
    // actually recorded (detail, entity type/id). There's no separate
    // document-name column on this entity, so a document search only hits
    // if the document's UUID (entityId) or something in detail matches.
    @Query("""
            SELECT a FROM AuditLogEntry a
            WHERE (:actorEmailPattern IS NULL OR LOWER(a.actorEmail) LIKE :actorEmailPattern)
              AND (:tenantId IS NULL OR a.tenantId = :tenantId)
              AND (:action IS NULL OR a.action = :action)
              AND (CAST(:from AS timestamp) IS NULL OR a.createdAt >= CAST(:from AS timestamp))
              AND (CAST(:to AS timestamp) IS NULL OR a.createdAt <= CAST(:to AS timestamp))
              AND (:qPattern IS NULL
                   OR LOWER(a.detail) LIKE :qPattern
                   OR LOWER(a.entityId) LIKE :qPattern
                   OR LOWER(a.entityType) LIKE :qPattern)
            """)
    Page<AuditLogEntry> search(
            @Param("actorEmailPattern") String actorEmailPattern,
            @Param("tenantId") UUID tenantId,
            @Param("action") String action,
            @Param("from") Instant from,
            @Param("to") Instant to,
            @Param("qPattern") String qPattern,
            Pageable pageable);

    /** A single user's full timeline, for the admin User CRM's per-user activity tab. */
    Page<AuditLogEntry> findByActorUserIdOrderByCreatedAtDesc(UUID actorUserId, Pageable pageable);

    long countByActorUserIdAndAction(UUID actorUserId, String action);

    @Query("SELECT MAX(a.createdAt) FROM AuditLogEntry a WHERE a.actorUserId = :actorUserId AND a.action = :action")
    Instant findMaxCreatedAtByActorUserIdAndAction(@Param("actorUserId") UUID actorUserId, @Param("action") String action);

    @Query("SELECT MAX(a.createdAt) FROM AuditLogEntry a WHERE a.actorUserId = :actorUserId")
    Instant findMaxCreatedAtByActorUserId(@Param("actorUserId") UUID actorUserId);

    @Query("SELECT a.createdAt FROM AuditLogEntry a WHERE a.actorUserId = :actorUserId AND a.createdAt >= :since ORDER BY a.createdAt ASC")
    List<Instant> findTimestampsSince(@Param("actorUserId") UUID actorUserId, @Param("since") Instant since);

    // Batch variants for the paginated user directory — one query per stat
    // across the whole candidate user set, rather than N+1 per row.
    @Query("SELECT a.actorUserId as userId, MAX(a.createdAt) as lastAt FROM AuditLogEntry a " +
           "WHERE a.actorUserId IN :userIds AND a.action = :action GROUP BY a.actorUserId")
    List<UserInstantRow> findMaxCreatedAtByActorUserIdInAndAction(
            @Param("userIds") List<UUID> userIds, @Param("action") String action);

    @Query("SELECT a.actorUserId as userId, MAX(a.createdAt) as lastAt FROM AuditLogEntry a " +
           "WHERE a.actorUserId IN :userIds GROUP BY a.actorUserId")
    List<UserInstantRow> findMaxCreatedAtByActorUserIdIn(@Param("userIds") List<UUID> userIds);

    // since is optional (see the from/to CAST comment above for why an
    // Instant compared only via "IS NULL" needs an explicit cast).
    @Query("SELECT a.actorUserId as userId, a.action as action, COUNT(a) as cnt FROM AuditLogEntry a " +
           "WHERE a.actorUserId IN :userIds AND a.action IN :actions " +
           "AND (CAST(:since AS timestamp) IS NULL OR a.createdAt >= CAST(:since AS timestamp)) " +
           "GROUP BY a.actorUserId, a.action")
    List<UserActionCountRow> countByActorUserIdInAndActionInSince(
            @Param("userIds") List<UUID> userIds, @Param("actions") List<String> actions, @Param("since") Instant since);

    interface UserInstantRow {
        UUID getUserId();
        Instant getLastAt();
    }

    interface UserActionCountRow {
        UUID getUserId();
        String getAction();
        long getCnt();
    }
}
