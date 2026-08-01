package com.akihlee.documents;

import com.akihlee.identity.TenantContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Service for managing document uploads with tenant isolation.
 */
@Service
public class DocumentService {

    private static final Logger log = LoggerFactory.getLogger(DocumentService.class);

    private final DocumentRepository documentRepository;
    private final StorageService storageService;
    private final RabbitTemplate rabbitTemplate;
    private final ObjectMapper objectMapper;

    public DocumentService(
            DocumentRepository documentRepository,
            StorageService storageService,
            RabbitTemplate rabbitTemplate,
            ObjectMapper objectMapper) {
        this.documentRepository = documentRepository;
        this.storageService = storageService;
        this.rabbitTemplate = rabbitTemplate;
        this.objectMapper = objectMapper;
    }

    /**
     * Upload a document for the current tenant.
     * The tenant ID is retrieved from TenantContext (set by auth layer).
     */
    @Transactional
    public Document uploadDocument(String filename, byte[] content, String contentType) {
        UUID tenantId = TenantContext.getCurrentTenantId();

        // Calculate checksum for deduplication
        String checksum = calculateChecksum(content);

        // Store file in object storage (S3/MinIO)
        String storageKey = String.format("%s/%s/%s", tenantId, UUID.randomUUID(), filename);
        storageService.store(storageKey, content, contentType);

        // Create database record
        Document document = new Document(
            tenantId,
            filename,
            storageKey,
            contentType,
            (long) content.length,
            checksum
        );

        Document saved = documentRepository.save(document);

        saved.updateStatus(Document.DocumentStatus.PROCESSING);
        saved = documentRepository.save(saved);
        publishDocumentReceived(saved);

        return saved;
    }

    private void publishDocumentReceived(Document document) {
        try {
            String payload = objectMapper.writeValueAsString(DocumentReceivedEvent.from(document));
            rabbitTemplate.convertAndSend(RabbitMQConfig.DOCUMENTS_RECEIVED_QUEUE, payload);
        } catch (Exception e) {
            // Don't fail the upload if the OCR pipeline is unreachable — the
            // document just stays at PROCESSING until it's requeued/retried
            // manually; the user's upload still succeeds either way.
            log.error("Failed to queue document {} for OCR processing", document.getId(), e);
        }
    }

    /**
     * Retrieve a document by ID.
     * Enforces tenant isolation - only returns document if it belongs to current tenant.
     */
    public Optional<Document> getDocument(UUID documentId) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        return documentRepository.findByIdAndTenantId(documentId, tenantId);
    }

    /**
     * List all documents for the current tenant.
     */
    public List<Document> listDocuments() {
        UUID tenantId = TenantContext.getCurrentTenantId();
        return documentRepository.findByTenantId(tenantId);
    }

    private String calculateChecksum(byte[] content) {
        try {
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(content);
            return bytesToHex(hash);
        } catch (Exception e) {
            throw new RuntimeException("Failed to calculate checksum", e);
        }
    }

    private static String bytesToHex(byte[] hash) {
        StringBuilder hexString = new StringBuilder(2 * hash.length);
        for (byte b : hash) {
            String hex = Integer.toHexString(0xff & b);
            if (hex.length() == 1) {
                hexString.append('0');
            }
            hexString.append(hex);
        }
        return hexString.toString();
    }
}
