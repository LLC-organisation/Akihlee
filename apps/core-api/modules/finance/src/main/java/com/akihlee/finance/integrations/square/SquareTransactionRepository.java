package com.akihlee.finance.integrations.square;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface SquareTransactionRepository extends JpaRepository<SquareTransaction, UUID> {

    /**
     * Find transactions for a specific tenant.
     * Enforces tenant isolation.
     */
    List<SquareTransaction> findByTenantId(UUID tenantId);

    /**
     * Find a transaction by external ID (Square transaction ID).
     * Used for idempotency - prevent duplicate imports.
     */
    Optional<SquareTransaction> findByExternalId(String externalId);

    /**
     * Find unreconciled transactions for a tenant.
     * Used to identify transactions that need ledger posting.
     */
    List<SquareTransaction> findByTenantIdAndReconciledFalse(UUID tenantId);

    /**
     * Find transactions within a date range for a tenant.
     */
    List<SquareTransaction> findByTenantIdAndTransactionDateBetween(
        UUID tenantId, Instant startDate, Instant endDate
    );

    /**
     * Check if a transaction already exists (idempotency check).
     */
    boolean existsByExternalId(String externalId);
}
