package com.akihlee.identity;

import jakarta.validation.constraints.NotBlank;

public record UpdateTenantRequest(@NotBlank String businessName) {
}
