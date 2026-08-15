package com.akihlee.identity;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface TenantRepository extends JpaRepository<Tenant, UUID> {

    Optional<Tenant> findByWhatsappPhoneNumber(String whatsappPhoneNumber);

    // searchPattern is a pre-built "%...%" LIKE pattern (or null), built in
    // the controller — see AuditLogRepository for why this can't be
    // concatenated inline against a possibly-null bound parameter.
    @Query("""
            SELECT t FROM Tenant t
            WHERE :searchPattern IS NULL
               OR LOWER(t.businessName) LIKE :searchPattern
               OR LOWER(CAST(t.id AS string)) LIKE :searchPattern
            """)
    Page<Tenant> search(@Param("searchPattern") String searchPattern, Pageable pageable);
}
