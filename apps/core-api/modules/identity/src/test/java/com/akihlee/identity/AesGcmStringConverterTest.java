package com.akihlee.identity;

import org.junit.jupiter.api.Test;

import java.util.Base64;
import java.util.HashSet;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AesGcmStringConverterTest {

    private static final String KEY = Base64.getEncoder().encodeToString(new byte[32]);

    @Test
    void roundTripsPlaintext() {
        AesGcmStringConverter converter = new AesGcmStringConverter(KEY);

        String stored = converter.convertToDatabaseColumn("a-quickbooks-refresh-token");

        assertThat(stored).isNotEqualTo("a-quickbooks-refresh-token");
        assertThat(converter.convertToEntityAttribute(stored)).isEqualTo("a-quickbooks-refresh-token");
    }

    @Test
    void passesNullThrough() {
        AesGcmStringConverter converter = new AesGcmStringConverter(KEY);

        assertThat(converter.convertToDatabaseColumn(null)).isNull();
        assertThat(converter.convertToEntityAttribute(null)).isNull();
    }

    @Test
    void encryptionIsNonDeterministic() {
        AesGcmStringConverter converter = new AesGcmStringConverter(KEY);

        Set<String> ciphertexts = new HashSet<>();
        for (int i = 0; i < 5; i++) {
            ciphertexts.add(converter.convertToDatabaseColumn("same-token"));
        }

        assertThat(ciphertexts).hasSize(5);
    }

    @Test
    void requiresKeyToEncryptOrDecrypt() {
        AesGcmStringConverter converter = new AesGcmStringConverter("");

        assertThatThrownBy(() -> converter.convertToDatabaseColumn("token"))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> converter.convertToEntityAttribute("stored-value"))
                .isInstanceOf(IllegalStateException.class);
    }
}
