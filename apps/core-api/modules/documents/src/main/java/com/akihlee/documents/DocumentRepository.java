package com.akihlee.documents;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface DocumentRepository extends JpaRepository<Document, UUID> {

    /**
     * Find all documents for a specific tenant.
     * This enforces tenant isolation at the query level.
     */
    List<Document> findByTenantId(UUID tenantId);

    /**
     * Find a document by ID and tenant ID.
     * This ensures a tenant can only access their own documents.
     */
    Optional<Document> findByIdAndTenantId(UUID id, UUID tenantId);
}
