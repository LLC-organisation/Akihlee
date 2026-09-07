package com.akihlee.identity;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

/**
 * Registration/login/change-password now happen against Supabase directly
 * from the browser (see UserProvisioningService for how a Supabase login
 * maps to this app's own Tenant/User). The only thing core-api still needs
 * to hand the frontend is who the caller is — Supabase's access token is
 * opaque to it, so it can no longer decode a role/tenant claim client-side.
 */
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final UserRepository userRepository;
    private final TenantRepository tenantRepository;

    public AuthController(UserRepository userRepository, TenantRepository tenantRepository) {
        this.userRepository = userRepository;
        this.tenantRepository = tenantRepository;
    }

    @GetMapping("/me")
    public MeResponse me() {
        UUID userId = UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
        Tenant tenant = tenantRepository.findById(user.getTenantId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Tenant not found"));
        return new MeResponse(user.getId(), user.getEmail(), tenant.getId(), user.getRole(), tenant.getBusinessName());
    }
}
