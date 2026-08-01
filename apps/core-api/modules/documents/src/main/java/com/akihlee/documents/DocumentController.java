package com.akihlee.documents;

import org.springframework.http.HttpStatus;
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

    public DocumentController(DocumentService documentService) {
        this.documentService = documentService;
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
}
