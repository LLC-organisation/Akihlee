package com.akihlee.documents;

import com.akihlee.identity.AuditAction;
import com.akihlee.identity.AuditLogService;
import com.akihlee.identity.TenantContext;
import com.akihlee.identity.User;
import com.akihlee.identity.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.EnumSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Service for managing document uploads with tenant isolation.
 */
@Service
public class DocumentService {

    private static final Logger log = LoggerFactory.getLogger(DocumentService.class);

    private static final Set<Document.DocumentStatus> REVIEWABLE_STATUSES =
            EnumSet.of(Document.DocumentStatus.EXTRACTED, Document.DocumentStatus.REVIEW_REQUIRED);

    private final DocumentRepository documentRepository;
    private final ExtractedDataRepository extractedDataRepository;
    private final StorageService storageService;
    private final RabbitTemplate rabbitTemplate;
    private final ObjectMapper objectMapper;
    private final AuditLogService auditLogService;
    private final UserRepository userRepository;

    public DocumentService(
            DocumentRepository documentRepository,
            ExtractedDataRepository extractedDataRepository,
            StorageService storageService,
            RabbitTemplate rabbitTemplate,
            ObjectMapper objectMapper,
            AuditLogService auditLogService,
            UserRepository userRepository) {
        this.documentRepository = documentRepository;
        this.extractedDataRepository = extractedDataRepository;
        this.storageService = storageService;
        this.rabbitTemplate = rabbitTemplate;
        this.objectMapper = objectMapper;
        this.auditLogService = auditLogService;
        this.userRepository = userRepository;
    }

    /**
     * Upload a document for the current tenant.
     * The tenant ID is retrieved from TenantContext (set by auth layer).
     */
    @Transactional
    public Document uploadDocument(String filename, byte[] content, String contentType) {
        return uploadDocument(filename, content, contentType, Document.DocumentSource.UPLOAD);
    }

    @Transactional
    public Document uploadDocument(String filename, byte[] content, String contentType, Document.DocumentSource source) {
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
            checksum,
            source
        );

        Document saved = documentRepository.save(document);

        saved.updateStatus(Document.DocumentStatus.PROCESSING);
        saved = documentRepository.save(saved);
        publishDocumentReceived(saved);

        // actorUserId/Email are null for webhook-originated uploads (WhatsApp/
        // email) — those requests never go through JwtAuthenticationFilter, so
        // there's no authenticated user to attribute the upload to.
        auditLogService.log(tenantId, currentUserId(), currentUserEmail(),
                AuditAction.DOCUMENT_UPLOAD, "DOCUMENT", saved.getId().toString(), filename);

        return saved;
    }

    /**
     * Seeds a Document + ExtractedData pair directly from already-structured
     * data (e.g. a Square payment), skipping storage and the OCR queue
     * entirely — there's no real file behind it.
     */
    @Transactional
    public Document createFromExternalData(UUID tenantId, Document.DocumentSource source,
                                            String syntheticFilename, ExternalDataSeed seed) {
        Document document = new Document(
                tenantId,
                syntheticFilename,
                "external:" + source + ":" + UUID.randomUUID(),
                "application/x-external-record",
                0L,
                "n/a",
                source
        );
        document.updateStatus(Document.DocumentStatus.EXTRACTED);
        Document saved = documentRepository.save(document);

        ExtractedData data = new ExtractedData(saved.getId(), tenantId, syntheticFilename);
        data.setMerchantName(seed.merchantName());
        data.setTransactionDate(seed.transactionDate());
        data.setTotalAmount(seed.totalAmount());
        data.setCurrency(seed.currency());
        data.setLineItemsJson("[]");
        data.setConfidence(1.0);
        extractedDataRepository.save(data);

        auditLogService.log(tenantId, currentUserId(), currentUserEmail(),
                AuditAction.DOCUMENT_IMPORTED, "DOCUMENT", saved.getId().toString(), syntheticFilename);

        return saved;
    }

    /**
     * Approves a document that's finished extraction and passed review.
     * Rejects (409) a stale/replayed request against a document that either
     * hasn't been extracted yet or is already in a terminal state.
     */
    @Transactional
    public Optional<Document> approve(UUID id) {
        return transitionAfterReview(id, Document.DocumentStatus.APPROVED, AuditAction.DOCUMENT_APPROVED, null);
    }

    @Transactional
    public Optional<Document> reject(UUID id, String reason) {
        return transitionAfterReview(id, Document.DocumentStatus.REJECTED, AuditAction.DOCUMENT_REJECTED, reason);
    }

    private Optional<Document> transitionAfterReview(UUID id, Document.DocumentStatus newStatus, String action, String reason) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        Optional<Document> found = documentRepository.findByIdAndTenantId(id, tenantId);
        if (found.isEmpty()) {
            return Optional.empty();
        }

        Document document = found.get();
        if (!REVIEWABLE_STATUSES.contains(document.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Document must be extracted and pending review before it can be " + newStatus.name().toLowerCase());
        }

        document.updateStatus(newStatus);
        Document saved = documentRepository.save(document);

        auditLogService.log(tenantId, currentUserId(), currentUserEmail(),
                action, "DOCUMENT", saved.getId().toString(), reason);

        return Optional.of(saved);
    }

    private UUID currentUserId() {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || authentication.getName() == null) {
            return null;
        }
        try {
            return UUID.fromString(authentication.getName());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private String currentUserEmail() {
        UUID userId = currentUserId();
        return userId != null ? userRepository.findById(userId).map(User::getEmail).orElse(null) : null;
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
