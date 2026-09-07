package com.akihlee.identity;

import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/tenant")
public class TenantController {

    private final TenantRepository tenantRepository;
    private final String inboundEmailDomain;

    public TenantController(
            TenantRepository tenantRepository,
            @Value("${email.inbound-domain}") String inboundEmailDomain) {
        this.tenantRepository = tenantRepository;
        this.inboundEmailDomain = inboundEmailDomain;
    }

    @GetMapping
    public TenantResponse get() {
        return toResponse(currentTenant());
    }

    @PutMapping
    public TenantResponse update(@Valid @RequestBody UpdateTenantRequest request) {
        Tenant tenant = currentTenant();
        tenant.setBusinessName(request.businessName());
        tenantRepository.save(tenant);
        return toResponse(tenant);
    }

    private Tenant currentTenant() {
        UUID tenantId = TenantContext.getCurrentTenantId();
        return tenantRepository.findById(tenantId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tenant not found"));
    }

    private TenantResponse toResponse(Tenant tenant) {
        return TenantResponse.from(tenant, inboundEmailDomain);
    }
}
