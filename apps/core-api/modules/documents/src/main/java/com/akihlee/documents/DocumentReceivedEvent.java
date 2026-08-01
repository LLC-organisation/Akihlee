package com.akihlee.documents;

/**
 * Published to RabbitMQ on upload; consumed by document-worker to trigger OCR.
 * Field names are snake_case to match the Python consumer's expected payload.
 */
public record DocumentReceivedEvent(
        String document_id,
        String tenant_id,
        String storage_key,
        String filename,
        String content_type) {

    public static DocumentReceivedEvent from(Document document) {
        return new DocumentReceivedEvent(
                document.getId().toString(),
                document.getTenantId().toString(),
                document.getStorageKey(),
                document.getFilename(),
                document.getContentType());
    }
}
