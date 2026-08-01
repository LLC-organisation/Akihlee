package com.akihlee.identity;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/tenant")
public class TenantController {

    private final TenantRepository tenantRepository;

    public TenantController(TenantRepository tenantRepository) {
        this.tenantRepository = tenantRepository;
    }

    @GetMapping
    public TenantResponse get() {
        return TenantResponse.from(currentTenant());
    }

    @PutMapping
    public TenantResponse update(@Valid @RequestBody UpdateTenantRequest request) {
        Tenant tenant = currentTenant();
        tenant.setBusinessName(request.businessName());
        tenantRepository.save(tenant);
        return TenantResponse.from(tenant);
    }

    /**
     * Links a WhatsApp number to the current tenant, so incoming messages
     * from that number (see WhatsAppWebhookController in the documents
     * module) can be attributed to this business.
     */
    @PutMapping("/whatsapp-number")
    public TenantResponse connectWhatsApp(@Valid @RequestBody WhatsAppNumberRequest request) {
        String normalized = normalize(request.phoneNumber());
        if (normalized.length() < 7) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter a valid phone number with country code");
        }

        UUID currentTenantId = TenantContext.getCurrentTenantId();
        boolean takenByAnotherTenant = tenantRepository.findByWhatsappPhoneNumber(normalized)
                .map(Tenant::getId)
                .filter(id -> !id.equals(currentTenantId))
                .isPresent();
        if (takenByAnotherTenant) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "That number is already connected to another account");
        }

        Tenant tenant = currentTenant();
        tenant.setWhatsappPhoneNumber(normalized);
        tenantRepository.save(tenant);
        return TenantResponse.from(tenant);
    }

    @DeleteMapping("/whatsapp-number")
    public TenantResponse disconnectWhatsApp() {
        Tenant tenant = currentTenant();
        tenant.setWhatsappPhoneNumber(null);
        tenantRepository.save(tenant);
        return TenantResponse.from(tenant);
    }

    private Tenant currentTenant() {
        UUID tenantId = TenantContext.getCurrentTenantId();
        return tenantRepository.findById(tenantId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tenant not found"));
    }

    private static String normalize(String phoneNumber) {
        return phoneNumber.replaceAll("[^0-9]", "");
    }
}
