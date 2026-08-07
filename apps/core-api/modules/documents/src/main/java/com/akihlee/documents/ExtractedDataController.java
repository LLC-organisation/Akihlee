package com.akihlee.documents;

import com.akihlee.identity.AuditAction;
import com.akihlee.identity.AuditLogService;
import com.akihlee.identity.TenantContext;
import com.akihlee.identity.User;
import com.akihlee.identity.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.UUID;

@RestController
public class ExtractedDataController {

    private final ExtractedDataRepository extractedDataRepository;
    private final DocumentRepository documentRepository;
    private final ObjectMapper objectMapper;
    private final String internalApiKey;
    private final AuditLogService auditLogService;
    private final UserRepository userRepository;

    public ExtractedDataController(
            ExtractedDataRepository extractedDataRepository,
            DocumentRepository documentRepository,
            ObjectMapper objectMapper,
            @Value("${worker.api-key}") String internalApiKey,
            AuditLogService auditLogService,
            UserRepository userRepository) {
        this.extractedDataRepository = extractedDataRepository;
        this.documentRepository = documentRepository;
        this.objectMapper = objectMapper;
        this.internalApiKey = internalApiKey;
        this.auditLogService = auditLogService;
        this.userRepository = userRepository;
    }

    /**
     * Called by document-worker once OCR extraction finishes for a document.
     * Authenticated via a shared internal key rather than a user JWT, since
     * the worker has no tenant/user session of its own.
     */
    @PostMapping("/api/v1/internal/documents/{id}/extraction")
    public ResponseEntity<Void> receiveExtraction(
            @PathVariable UUID id,
            @RequestHeader("X-Internal-Api-Key") String apiKey,
            @RequestBody ExtractionCallbackRequest request) {
        if (!internalApiKey.equals(apiKey)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        Document document = documentRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Document not found"));

        ExtractedData data = extractedDataRepository.findByDocumentId(id)
                .orElseGet(() -> new ExtractedData(id, document.getTenantId(), document.getFilename()));

        data.setMerchantName(request.merchantName());
        data.setTransactionDate(
                request.transactionDate() != null ? LocalDate.parse(request.transactionDate()) : null);
        data.setTotalAmount(request.totalAmount());
        data.setCurrency(request.currency());
        data.setTaxAmount(request.taxAmount());
        data.setLineItemsJson(toJson(request.lineItems()));
        data.setRawText(request.rawText());
        data.setConfidence(request.confidence());
        extractedDataRepository.save(data);

        Document.DocumentStatus newStatus = "EXTRACTED".equalsIgnoreCase(request.status())
                ? Document.DocumentStatus.EXTRACTED
                : Document.DocumentStatus.REVIEW_REQUIRED;
        document.updateStatus(newStatus);
        documentRepository.save(document);

        // No user JWT on this path (see the internal-key check above) — the
        // OCR worker is the actor, not a tenant user.
        auditLogService.log(document.getTenantId(), null, "document-worker",
                AuditAction.DOCUMENT_STATUS_CHANGE, "DOCUMENT", document.getId().toString(), newStatus.name());

        return ResponseEntity.ok().build();
    }

    /**
     * Paginated, tenant-scoped view of everything the OCR pipeline has
     * extracted so far — the data the AI CFO features will read from.
     */
    @GetMapping("/api/v1/extracted-data")
    public Page<ExtractedData> list(
            @PageableDefault(size = 10, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        return extractedDataRepository.findByTenantId(tenantId, pageable);
    }

    /**
     * Lets a tenant user correct a field OCR got wrong (e.g. a garbled
     * merchant name or misread total). Only the fields a person would
     * plausibly need to fix are editable — raw OCR text/confidence/line
     * items are left as the pipeline produced them.
     */
    @PutMapping("/api/v1/extracted-data/{id}")
    public ExtractedData update(@PathVariable UUID id, @RequestBody UpdateExtractedDataRequest request) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        ExtractedData data = extractedDataRepository.findById(id)
                .filter(d -> d.getTenantId().equals(tenantId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Extracted data not found"));

        data.setMerchantName(request.merchantName());
        data.setTransactionDate(
                request.transactionDate() != null ? LocalDate.parse(request.transactionDate()) : null);
        data.setTotalAmount(request.totalAmount());
        data.setCurrency(request.currency());
        data.setTaxAmount(request.taxAmount());
        extractedDataRepository.save(data);

        auditLogService.log(tenantId, currentUserId(), currentUserEmail(),
                AuditAction.EXTRACTED_DATA_EDITED, "EXTRACTED_DATA", id.toString(), toJson(request));

        return data;
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

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            return "[]";
        }
    }
}
