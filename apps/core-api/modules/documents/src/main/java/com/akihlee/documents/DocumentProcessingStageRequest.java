package com.akihlee.documents;

/** Body for document-worker's best-effort mid-processing progress updates. */
public record DocumentProcessingStageRequest(String stage) {
}
