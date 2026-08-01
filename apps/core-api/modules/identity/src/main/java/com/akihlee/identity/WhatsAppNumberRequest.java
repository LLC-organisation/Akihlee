package com.akihlee.identity;

import jakarta.validation.constraints.NotBlank;

public record WhatsAppNumberRequest(@NotBlank String phoneNumber) {
}
