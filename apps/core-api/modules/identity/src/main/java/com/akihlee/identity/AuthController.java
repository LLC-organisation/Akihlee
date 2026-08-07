package com.akihlee.identity;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final TenantRepository tenantRepository;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuditLogService auditLogService;

    public AuthController(
            TenantRepository tenantRepository,
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            AuditLogService auditLogService) {
        this.tenantRepository = tenantRepository;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.auditLogService = auditLogService;
    }

    /**
     * Registers a new business (tenant) along with its first login account.
     */
    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthResponse register(@Valid @RequestBody RegisterRequest request) {
        if (userRepository.findByEmail(request.email()).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email already registered");
        }

        Tenant tenant = tenantRepository.save(new Tenant(request.businessName()));
        User user = userRepository.save(new User(
                tenant.getId(), request.email(), passwordEncoder.encode(request.password())));

        String token = jwtService.generateToken(user.getId(), tenant.getId(), user.getEmail(), user.getRole());
        auditLogService.log(tenant.getId(), user.getId(), user.getEmail(), AuditAction.REGISTER);
        return new AuthResponse(token, tenant.getId(), user.getEmail(), tenant.getBusinessName());
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest request) {
        User user = userRepository.findByEmail(request.email())
                .filter(u -> passwordEncoder.matches(request.password(), u.getPasswordHash()))
                .orElseGet(() -> {
                    auditLogService.log(null, null, request.email(), AuditAction.LOGIN_FAILURE);
                    throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid email or password");
                });

        Tenant tenant = tenantRepository.findById(user.getTenantId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Tenant not found"));

        String token = jwtService.generateToken(user.getId(), tenant.getId(), user.getEmail(), user.getRole());
        auditLogService.log(tenant.getId(), user.getId(), user.getEmail(), AuditAction.LOGIN_SUCCESS);
        return new AuthResponse(token, tenant.getId(), user.getEmail(), tenant.getBusinessName());
    }

    /**
     * Requires authentication (unlike register/login) — the JWT's subject
     * (see JwtAuthenticationFilter) identifies which user to update.
     */
    @PutMapping("/change-password")
    public void changePassword(@Valid @RequestBody ChangePasswordRequest request) {
        UUID userId = UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        if (!passwordEncoder.matches(request.currentPassword(), user.getPasswordHash())) {
            auditLogService.log(user.getTenantId(), user.getId(), user.getEmail(), AuditAction.PASSWORD_CHANGE_FAILURE);
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Current password is incorrect");
        }

        user.changePassword(passwordEncoder.encode(request.newPassword()));
        userRepository.save(user);
        auditLogService.log(user.getTenantId(), user.getId(), user.getEmail(), AuditAction.PASSWORD_CHANGE);
    }
}
