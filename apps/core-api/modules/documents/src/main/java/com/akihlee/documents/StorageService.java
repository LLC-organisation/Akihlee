package com.akihlee.documents;

/**
 * Abstraction for object storage (S3, MinIO, etc).
 */
public interface StorageService {

    /**
     * Store content at the given key.
     */
    void store(String key, byte[] content, String contentType);

    /**
     * Retrieve content by key.
     */
    byte[] retrieve(String key);

    /**
     * Delete content by key.
     */
    void delete(String key);

    /**
     * Check if a key exists.
     */
    boolean exists(String key);
}
