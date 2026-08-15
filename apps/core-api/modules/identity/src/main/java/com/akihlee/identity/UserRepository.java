package com.akihlee.identity;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByEmail(String email);

    // Base rows for the admin User CRM directory (see AdminUserController) —
    // deliberately not paginated here. Activity/session stats live in
    // audit_log/user_activity_pings, not on User, so sorting by them can't
    // happen at this query's level; the controller fetches this filtered
    // set in full (bounded by search/tenant/role, and this app's scale),
    // merges in the aggregate stats, sorts, then paginates in memory — the
    // same fetch-then-aggregate-in-Java approach AnalyticsService uses,
    // rather than a fragile native query with dynamic ORDER BY.
    //
    // searchPattern is a pre-built "%...%" LIKE pattern (or null) — see
    // AuditLogRepository for why this can't be concatenated inline.
    @Query("""
            SELECT u.id as id, u.tenantId as tenantId, t.businessName as tenantBusinessName,
                   u.email as email, u.role as role, u.active as activeFlag, u.createdAt as createdAt
            FROM User u JOIN Tenant t ON t.id = u.tenantId
            WHERE (:tenantId IS NULL OR u.tenantId = :tenantId)
              AND (:role IS NULL OR u.role = :role)
              AND (:searchPattern IS NULL
                   OR LOWER(u.email) LIKE :searchPattern
                   OR LOWER(t.businessName) LIKE :searchPattern)
            ORDER BY u.email ASC
            """)
    List<UserDirectoryBaseRow> findDirectoryBaseRows(
            @Param("tenantId") UUID tenantId,
            @Param("role") UserRole role,
            @Param("searchPattern") String searchPattern);

    interface UserDirectoryBaseRow {
        UUID getId();
        UUID getTenantId();
        String getTenantBusinessName();
        String getEmail();
        UserRole getRole();
        boolean getActiveFlag();
        Instant getCreatedAt();
    }
}
