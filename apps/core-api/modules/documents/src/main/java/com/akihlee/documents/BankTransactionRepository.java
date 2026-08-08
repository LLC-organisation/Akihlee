package com.akihlee.documents;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface BankTransactionRepository extends JpaRepository<BankTransaction, UUID> {

    List<BankTransaction> findByExtractedDataIdOrderByTransactionDateAsc(UUID extractedDataId);

    void deleteByExtractedDataId(@Param("extractedDataId") UUID extractedDataId);
}
