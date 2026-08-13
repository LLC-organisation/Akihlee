package com.akihlee.identity;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.UUID;

@Repository
public interface AuditLogRepository extends JpaRepository<AuditLogEntry, UUID> {

    // actorEmailPattern is a pre-built "%...%" LIKE pattern (or null), built
    // in the controller rather than concatenated here — concatenating a
    // possibly-null bound parameter with || makes Postgres's overload
    // resolution for || ambiguous (it can pick the bytea overload instead of
    // text for an untyped null), which threw "function lower(bytea) does
    // not exist" even though actor_email is plain VARCHAR(255).
    @Query("""
            SELECT a FROM AuditLogEntry a
            WHERE (:actorEmailPattern IS NULL OR LOWER(a.actorEmail) LIKE :actorEmailPattern)
              AND (:tenantId IS NULL OR a.tenantId = :tenantId)
              AND (:action IS NULL OR a.action = :action)
              AND (:from IS NULL OR a.createdAt >= :from)
              AND (:to IS NULL OR a.createdAt <= :to)
            """)
    Page<AuditLogEntry> search(
            @Param("actorEmailPattern") String actorEmailPattern,
            @Param("tenantId") UUID tenantId,
            @Param("action") String action,
            @Param("from") Instant from,
            @Param("to") Instant to,
            Pageable pageable);
}
