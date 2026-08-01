package com.akihlee.documents;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface ExtractedDataRepository extends JpaRepository<ExtractedData, UUID> {

    Page<ExtractedData> findByTenantId(UUID tenantId, Pageable pageable);

    Optional<ExtractedData> findByDocumentId(UUID documentId);
}
