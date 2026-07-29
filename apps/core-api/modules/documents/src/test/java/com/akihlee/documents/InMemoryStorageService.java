package com.akihlee.documents;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory storage implementation for testing.
 */
public class InMemoryStorageService implements StorageService {

    private final Map<String, byte[]> storage = new ConcurrentHashMap<>();

    @Override
    public void store(String key, byte[] content, String contentType) {
        storage.put(key, content);
    }

    @Override
    public byte[] retrieve(String key) {
        byte[] content = storage.get(key);
        if (content == null) {
            throw new IllegalArgumentException("Key not found: " + key);
        }
        return content;
    }

    @Override
    public void delete(String key) {
        storage.remove(key);
    }

    @Override
    public boolean exists(String key) {
        return storage.containsKey(key);
    }

    public void clear() {
        storage.clear();
    }
}
