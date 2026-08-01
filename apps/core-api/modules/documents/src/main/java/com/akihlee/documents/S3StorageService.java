package com.akihlee.documents;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;

/**
 * S3/MinIO-backed implementation of StorageService.
 */
@Service
public class S3StorageService implements StorageService {

    private final S3Client s3Client;
    private final String bucket;

    public S3StorageService(S3Client s3Client, @Value("${s3.bucket.documents}") String bucket) {
        this.s3Client = s3Client;
        this.bucket = bucket;
    }

    @Override
    public void store(String key, byte[] content, String contentType) {
        s3Client.putObject(
                PutObjectRequest.builder()
                        .bucket(bucket)
                        .key(key)
                        .contentType(contentType)
                        .contentLength((long) content.length)
                        .build(),
                RequestBody.fromBytes(content));
    }

    @Override
    public byte[] retrieve(String key) {
        try (ResponseInputStream<GetObjectResponse> response = s3Client.getObject(
                GetObjectRequest.builder()
                        .bucket(bucket)
                        .key(key)
                        .build())) {
            return response.readAllBytes();
        } catch (java.io.IOException e) {
            throw new RuntimeException("Failed to read object with key: " + key, e);
        }
    }

    @Override
    public void delete(String key) {
        s3Client.deleteObject(
                DeleteObjectRequest.builder()
                        .bucket(bucket)
                        .key(key)
                        .build());
    }

    @Override
    public boolean exists(String key) {
        try {
            s3Client.headObject(
                    HeadObjectRequest.builder()
                            .bucket(bucket)
                            .key(key)
                            .build());
            return true;
        } catch (NoSuchKeyException e) {
            return false;
        }
    }
}
