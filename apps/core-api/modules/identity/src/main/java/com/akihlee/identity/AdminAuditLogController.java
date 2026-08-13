package com.akihlee.identity;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.UUID;

/**
 * Admin-only view over the audit trail (see SecurityConfig's
 * /api/v1/admin/** gate, enforced on the "role" JWT claim) — for
 * troubleshooting a specific user's actions, or reconstructing a timeline
 * during a security investigation.
 */
@RestController
@RequestMapping("/api/v1/admin/audit-log")
public class AdminAuditLogController {

    private final AuditLogRepository auditLogRepository;

    public AdminAuditLogController(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
    }

    @GetMapping
    public Page<AuditLogEntry> search(
            @RequestParam(required = false) String actorEmail,
            @RequestParam(required = false) UUID tenantId,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @PageableDefault(size = 25, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        String actorEmailPattern = actorEmail != null && !actorEmail.isBlank()
                ? "%" + actorEmail.toLowerCase() + "%"
                : null;
        return auditLogRepository.search(actorEmailPattern, tenantId, action, from, to, pageable);
    }
}
