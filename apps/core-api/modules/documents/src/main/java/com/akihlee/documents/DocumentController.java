package com.akihlee.documents;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/documents")
public class DocumentController {

    private final DocumentService documentService;
    private final StorageService storageService;

    public DocumentController(DocumentService documentService, StorageService storageService) {
        this.documentService = documentService;
        this.storageService = storageService;
    }

    @PostMapping(consumes = "multipart/form-data")
    @ResponseStatus(HttpStatus.CREATED)
    public Document upload(@RequestParam("file") MultipartFile file) {
        try {
            return documentService.uploadDocument(
                    file.getOriginalFilename(), file.getBytes(), file.getContentType());
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to read uploaded file", e);
        }
    }

    @GetMapping
    public List<Document> list() {
        return documentService.listDocuments();
    }

    @GetMapping("/{id}")
    public ResponseEntity<Document> get(@PathVariable UUID id) {
        return documentService.getDocument(id)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping("/{id}/approve")
    public ResponseEntity<Document> approve(@PathVariable UUID id) {
        return documentService.approve(id)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping("/{id}/reject")
    public ResponseEntity<Document> reject(@PathVariable UUID id, @RequestBody(required = false) RejectDocumentRequest request) {
        String reason = request != null ? request.reason() : null;
        return documentService.reject(id, reason)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /**
     * Streams the original file back. Must resolve the document through
     * documentService.getDocument (tenant-scoped) rather than any untenanted
     * lookup — this is the one place a wrong lookup would leak another
     * tenant's file bytes by UUID.
     */
    @GetMapping("/{id}/content")
    public ResponseEntity<byte[]> content(@PathVariable UUID id) {
        return documentService.getDocument(id)
                .filter(d -> d.getSource() != Document.DocumentSource.SQUARE)
                .map(d -> ResponseEntity.ok()
                        .contentType(MediaType.parseMediaType(d.getContentType()))
                        .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + d.getFilename() + "\"")
                        .body(storageService.retrieve(d.getStorageKey())))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
