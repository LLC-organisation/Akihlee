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

    @Query("""
            SELECT a FROM AuditLogEntry a
            WHERE (:actorEmail IS NULL OR LOWER(a.actorEmail) LIKE LOWER(CONCAT('%', :actorEmail, '%')))
              AND (:tenantId IS NULL OR a.tenantId = :tenantId)
              AND (:action IS NULL OR a.action = :action)
              AND (:from IS NULL OR a.createdAt >= :from)
              AND (:to IS NULL OR a.createdAt <= :to)
            """)
    Page<AuditLogEntry> search(
            @Param("actorEmail") String actorEmail,
            @Param("tenantId") UUID tenantId,
            @Param("action") String action,
            @Param("from") Instant from,
            @Param("to") Instant to,
            Pageable pageable);
}
