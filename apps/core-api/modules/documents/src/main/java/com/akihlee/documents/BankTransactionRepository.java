package com.akihlee.documents;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Repository
public interface BankTransactionRepository extends JpaRepository<BankTransaction, UUID> {

    List<BankTransaction> findByExtractedDataIdOrderByTransactionDateAsc(UUID extractedDataId);

    void deleteByExtractedDataId(@Param("extractedDataId") UUID extractedDataId);

    /**
     * Used by analytics aggregation — extractedDataIds is pre-filtered to
     * rows belonging to a tenant's APPROVED documents (see AnalyticsService).
     */
    List<BankTransaction> findByExtractedDataIdInAndTypeAndTransactionDateBetween(
            List<UUID> extractedDataIds, BankTransaction.Type type, LocalDate from, LocalDate to);

    /**
     * Same use case as above but unfiltered by type — used by the combined
     * income/expense overview, which needs INCOME and EXPENSE rows together.
     */
    List<BankTransaction> findByExtractedDataIdInAndTransactionDateBetween(
            List<UUID> extractedDataIds, LocalDate from, LocalDate to);
}
