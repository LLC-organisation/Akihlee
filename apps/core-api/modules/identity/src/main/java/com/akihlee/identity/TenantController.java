package com.akihlee.identity;

import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/tenant")
public class TenantController {

    private final TenantRepository tenantRepository;
    private final UserRepository userRepository;
    private final String inboundEmailDomain;
    private final ApplicationEventPublisher eventPublisher;
    private final AuditLogService auditLogService;

    public TenantController(
            TenantRepository tenantRepository,
            UserRepository userRepository,
            @Value("${email.inbound-domain}") String inboundEmailDomain,
            ApplicationEventPublisher eventPublisher,
            AuditLogService auditLogService) {
        this.tenantRepository = tenantRepository;
        this.userRepository = userRepository;
        this.inboundEmailDomain = inboundEmailDomain;
        this.eventPublisher = eventPublisher;
        this.auditLogService = auditLogService;
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
        eventPublisher.publishEvent(new WhatsAppNumberConnectedEvent(normalized, tenant.getBusinessName()));
        auditLogService.log(tenant.getId(), currentUserId(), currentUserEmail(),
                AuditAction.WHATSAPP_NUMBER_CONNECTED, "TENANT", tenant.getId().toString(), normalized);
        return toResponse(tenant);
    }

    @DeleteMapping("/whatsapp-number")
    public TenantResponse disconnectWhatsApp() {
        Tenant tenant = currentTenant();
        tenant.setWhatsappPhoneNumber(null);
        tenantRepository.save(tenant);
        auditLogService.log(tenant.getId(), currentUserId(), currentUserEmail(),
                AuditAction.WHATSAPP_NUMBER_DISCONNECTED, "TENANT", tenant.getId().toString(), null);
        return toResponse(tenant);
    }

    private Tenant currentTenant() {
        UUID tenantId = TenantContext.getCurrentTenantId();
        return tenantRepository.findById(tenantId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tenant not found"));
    }

    private UUID currentUserId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }

    private String currentUserEmail() {
        return userRepository.findById(currentUserId()).map(User::getEmail).orElse(null);
    }

    private TenantResponse toResponse(Tenant tenant) {
        return TenantResponse.from(tenant, inboundEmailDomain);
    }

    private static String normalize(String phoneNumber) {
        return phoneNumber.replaceAll("[^0-9]", "");
    }
}
