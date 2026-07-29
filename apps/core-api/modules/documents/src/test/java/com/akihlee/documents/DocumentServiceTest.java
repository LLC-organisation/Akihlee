package com.akihlee.documents;

import com.akihlee.identity.Tenant;
import com.akihlee.identity.TenantContext;
import com.akihlee.identity.TenantRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * TRACER BULLET TEST: Verifies tenant-isolated document upload.
 *
 * This test proves:
 * 1. A user can upload a document to their tenant
 * 2. The document is associated with that tenant
 * 3. Another tenant cannot access that document (tenant isolation)
 */
@Testcontainers
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({DocumentService.class, InMemoryStorageService.class})
class DocumentServiceTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    private DocumentService documentService;

    @Autowired
    private DocumentRepository documentRepository;

    @Autowired
    private TenantRepository tenantRepository;

    @Autowired
    private InMemoryStorageService storageService;

    private Tenant tenantA;
    private Tenant tenantB;

    @BeforeEach
    void setUp() {
        // Create two separate tenants for isolation testing
        tenantA = tenantRepository.save(new Tenant("Café Mocha"));
        tenantB = tenantRepository.save(new Tenant("Bistro Bella"));

        storageService.clear();
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    @Test
    void shouldUploadDocumentAndAssociateWithTenant() {
        // Given: Acting as Tenant A
        TenantContext.setCurrentTenantId(tenantA.getId());
        byte[] receiptContent = "Receipt: Coffee - $5.00".getBytes();

        // When: Uploading a receipt
        Document uploaded = documentService.uploadDocument(
            "receipt_001.pdf",
            receiptContent,
            "application/pdf"
        );

        // Then: Document should be created and associated with Tenant A
        assertThat(uploaded).isNotNull();
        assertThat(uploaded.getId()).isNotNull();
        assertThat(uploaded.getTenantId()).isEqualTo(tenantA.getId());
        assertThat(uploaded.getFilename()).isEqualTo("receipt_001.pdf");
        assertThat(uploaded.getContentType()).isEqualTo("application/pdf");
        assertThat(uploaded.getSizeBytes()).isEqualTo(receiptContent.length);
        assertThat(uploaded.getStatus()).isEqualTo(Document.DocumentStatus.UPLOADED);

        // And: Document should be retrievable by Tenant A
        Optional<Document> retrieved = documentService.getDocument(uploaded.getId());
        assertThat(retrieved).isPresent();
        assertThat(retrieved.get().getId()).isEqualTo(uploaded.getId());
    }

    @Test
    void shouldEnforceTenantIsolation_cannotAccessOtherTenantsDocuments() {
        // Given: Tenant A uploads a receipt
        TenantContext.setCurrentTenantId(tenantA.getId());
        Document tenantADocument = documentService.uploadDocument(
            "receipt_tenantA.pdf",
            "Tenant A Receipt".getBytes(),
            "application/pdf"
        );
        UUID documentId = tenantADocument.getId();

        // When: Tenant B tries to access Tenant A's document
        TenantContext.setCurrentTenantId(tenantB.getId());
        Optional<Document> accessed = documentService.getDocument(documentId);

        // Then: Tenant B should NOT be able to access it (tenant isolation)
        assertThat(accessed).isEmpty();
    }

    @Test
    void shouldListOnlyCurrentTenantsDocuments() {
        // Given: Tenant A uploads 2 documents
        TenantContext.setCurrentTenantId(tenantA.getId());
        documentService.uploadDocument("receipt1.pdf", "Receipt 1".getBytes(), "application/pdf");
        documentService.uploadDocument("receipt2.pdf", "Receipt 2".getBytes(), "application/pdf");

        // And: Tenant B uploads 1 document
        TenantContext.setCurrentTenantId(tenantB.getId());
        documentService.uploadDocument("invoice1.pdf", "Invoice 1".getBytes(), "application/pdf");

        // When: Listing documents as Tenant A
        TenantContext.setCurrentTenantId(tenantA.getId());
        List<Document> tenantADocs = documentService.listDocuments();

        // Then: Should only see Tenant A's 2 documents
        assertThat(tenantADocs).hasSize(2);
        assertThat(tenantADocs).allMatch(doc -> doc.getTenantId().equals(tenantA.getId()));

        // When: Listing documents as Tenant B
        TenantContext.setCurrentTenantId(tenantB.getId());
        List<Document> tenantBDocs = documentService.listDocuments();

        // Then: Should only see Tenant B's 1 document
        assertThat(tenantBDocs).hasSize(1);
        assertThat(tenantBDocs).allMatch(doc -> doc.getTenantId().equals(tenantB.getId()));
    }

    @Test
    void shouldStoreFileContentInObjectStorage() {
        // Given: Acting as Tenant A with file content
        TenantContext.setCurrentTenantId(tenantA.getId());
        byte[] content = "PDF binary content here".getBytes();

        // When: Uploading document
        Document doc = documentService.uploadDocument("invoice.pdf", content, "application/pdf");

        // Then: File should exist in storage
        assertThat(storageService.exists(doc.getStorageKey())).isTrue();
        byte[] retrieved = storageService.retrieve(doc.getStorageKey());
        assertThat(retrieved).isEqualTo(content);
    }
}
