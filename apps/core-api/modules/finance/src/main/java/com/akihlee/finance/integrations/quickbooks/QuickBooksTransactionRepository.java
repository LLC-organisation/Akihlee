package com.akihlee.finance.integrations.quickbooks;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface QuickBooksTransactionRepository extends JpaRepository<QuickBooksTransaction, UUID> {

    /** Idempotency check — prevent duplicate imports. */
    boolean existsByExternalId(String externalId);
}
