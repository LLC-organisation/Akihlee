package com.akihlee.documents;

import com.akihlee.identity.TenantContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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

    public ExtractedDataController(
            ExtractedDataRepository extractedDataRepository,
            DocumentRepository documentRepository,
            ObjectMapper objectMapper,
            @Value("${worker.api-key}") String internalApiKey) {
        this.extractedDataRepository = extractedDataRepository;
        this.documentRepository = documentRepository;
        this.objectMapper = objectMapper;
        this.internalApiKey = internalApiKey;
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

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            return "[]";
        }
    }
}
