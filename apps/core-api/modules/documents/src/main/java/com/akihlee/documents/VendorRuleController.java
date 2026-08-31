package com.akihlee.documents;

import com.akihlee.identity.AuditAction;
import com.akihlee.identity.AuditLogService;
import com.akihlee.identity.TenantContext;
import com.akihlee.identity.User;
import com.akihlee.identity.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

/**
 * CRUD for a tenant's "always categorize X as Y" vendor rules — see
 * VendorRule for what gets applied where (ExtractedDataController.receiveExtraction).
 */
@RestController
@RequestMapping("/api/v1/vendor-rules")
public class VendorRuleController {

    private final VendorRuleRepository vendorRuleRepository;
    private final AuditLogService auditLogService;
    private final UserRepository userRepository;

    public VendorRuleController(VendorRuleRepository vendorRuleRepository, AuditLogService auditLogService,
                                 UserRepository userRepository) {
        this.vendorRuleRepository = vendorRuleRepository;
        this.auditLogService = auditLogService;
        this.userRepository = userRepository;
    }

    @GetMapping
    public List<VendorRule> list() {
        return vendorRuleRepository.findByTenantIdOrderByCreatedAtDesc(TenantContext.getCurrentTenantId());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public VendorRule create(@RequestBody VendorRuleRequest request) {
        if (request.vendorPattern() == null || request.vendorPattern().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "vendorPattern is required");
        }
        BankTransaction.Type type;
        try {
            type = BankTransaction.Type.valueOf(request.type());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid transaction type: " + request.type());
        }
        UUID tenantId = TenantContext.getCurrentTenantId();
        VendorRule rule = new VendorRule(tenantId, request.vendorPattern().trim(), type, request.category());
        vendorRuleRepository.save(rule);

        auditLogService.log(tenantId, currentUserId(), currentUserEmail(),
                AuditAction.VENDOR_RULE_CREATED, "VENDOR_RULE", rule.getId().toString(),
                rule.getVendorPattern() + " -> " + rule.getCategory());

        return rule;
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable UUID id) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        VendorRule rule = vendorRuleRepository.findById(id)
                .filter(r -> r.getTenantId().equals(tenantId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vendor rule not found"));

        vendorRuleRepository.delete(rule);

        auditLogService.log(tenantId, currentUserId(), currentUserEmail(),
                AuditAction.VENDOR_RULE_DELETED, "VENDOR_RULE", id.toString(), rule.getVendorPattern());
    }

    private UUID currentUserId() {
        var authentication = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || authentication.getName() == null) {
            return null;
        }
        try {
            return UUID.fromString(authentication.getName());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private String currentUserEmail() {
        UUID userId = currentUserId();
        return userId != null ? userRepository.findById(userId).map(User::getEmail).orElse(null) : null;
    }
}
