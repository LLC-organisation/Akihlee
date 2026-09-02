package com.akihlee.identity;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * Encrypts entity fields at rest with AES-256-GCM — used for QuickBooks'
 * OAuth access/refresh tokens (Intuit's security review requires these be
 * encrypted, not stored in plaintext). Not auto-applied ({@code
 * autoApply = false}): opt in per field with {@code @Convert} rather than
 * silently encrypting every String column.
 *
 * Stored form is base64(IV || ciphertext+tag) — a fresh random 12-byte IV
 * per encryption (GCM requires a unique IV per key; reusing one breaks its
 * confidentiality guarantees), read back off the front of the blob on
 * decrypt. Spring Boot auto-registers Hibernate's SpringBeanContainer, so a
 * {@code @Component}-annotated converter gets normal {@code @Value}
 * injection instead of the no-args-only construction plain JPA converters
 * are otherwise limited to.
 */
@Component
@Converter(autoApply = false)
public class AesGcmStringConverter implements AttributeConverter<String, String> {

    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int IV_LENGTH_BYTES = 12;
    private static final int TAG_LENGTH_BITS = 128;

    private final SecretKeySpec key;
    private final SecureRandom secureRandom = new SecureRandom();

    public AesGcmStringConverter(@Value("${security.token-encryption-key:}") String base64Key) {
        this.key = base64Key.isBlank() ? null : new SecretKeySpec(Base64.getDecoder().decode(base64Key), "AES");
    }

    @Override
    public String convertToDatabaseColumn(String plaintext) {
        if (plaintext == null) {
            return null;
        }
        requireKey();
        try {
            byte[] iv = new byte[IV_LENGTH_BYTES];
            secureRandom.nextBytes(iv);

            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_LENGTH_BITS, iv));
            byte[] ciphertext = cipher.doFinal(plaintext.getBytes(java.nio.charset.StandardCharsets.UTF_8));

            ByteBuffer buffer = ByteBuffer.allocate(iv.length + ciphertext.length);
            buffer.put(iv).put(ciphertext);
            return Base64.getEncoder().encodeToString(buffer.array());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Failed to encrypt token field", e);
        }
    }

    @Override
    public String convertToEntityAttribute(String stored) {
        if (stored == null) {
            return null;
        }
        requireKey();
        try {
            byte[] decoded = Base64.getDecoder().decode(stored);
            ByteBuffer buffer = ByteBuffer.wrap(decoded);
            byte[] iv = new byte[IV_LENGTH_BYTES];
            buffer.get(iv);
            byte[] ciphertext = new byte[buffer.remaining()];
            buffer.get(ciphertext);

            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_LENGTH_BITS, iv));
            return new String(cipher.doFinal(ciphertext), java.nio.charset.StandardCharsets.UTF_8);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Failed to decrypt token field", e);
        }
    }

    private void requireKey() {
        if (key == null) {
            throw new IllegalStateException(
                    "security.token-encryption-key (QUICKBOOKS_TOKEN_ENCRYPTION_KEY) is not configured");
        }
    }
}
