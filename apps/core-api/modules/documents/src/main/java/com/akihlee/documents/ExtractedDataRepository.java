package com.akihlee.documents;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ExtractedDataRepository extends JpaRepository<ExtractedData, UUID> {

    Page<ExtractedData> findByTenantId(UUID tenantId, Pageable pageable);

    Optional<ExtractedData> findByDocumentId(UUID documentId);

    /**
     * Used by analytics aggregation — documentIds is pre-filtered to a
     * tenant's APPROVED documents (see AnalyticsService), so this only
     * narrows further by transaction date range.
     */
    List<ExtractedData> findByTenantIdAndDocumentIdInAndTransactionDateBetween(
            UUID tenantId, List<UUID> documentIds, LocalDate from, LocalDate to);

    /** Same idea, no date filter — used to resolve which extracted_data rows are "approved" at all. */
    List<ExtractedData> findByTenantIdAndDocumentIdIn(UUID tenantId, List<UUID> documentIds);
}
