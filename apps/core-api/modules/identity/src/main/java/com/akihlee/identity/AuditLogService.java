package com.akihlee.identity;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.UUID;

/**
 * Writes to the audit trail (see AuditLogEntry). Reads the current request
 * off Spring's RequestContextHolder rather than requiring every caller to
 * thread an HttpServletRequest through their method signatures — this
 * works from any bean invoked within a normal request thread, including
 * service-layer code several calls removed from the controller.
 *
 * Never lets a logging failure break the action being logged — a missed
 * audit entry is bad, but not as bad as a broken login/upload — so
 * failures are caught and logged, not thrown.
 */
@Service
public class AuditLogService {

    private static final Logger logger = LoggerFactory.getLogger(AuditLogService.class);

    private final AuditLogRepository auditLogRepository;
    private final TenantRepository tenantRepository;

    public AuditLogService(AuditLogRepository auditLogRepository, TenantRepository tenantRepository) {
        this.auditLogRepository = auditLogRepository;
        this.tenantRepository = tenantRepository;
    }

    public void log(UUID tenantId, UUID actorUserId, String actorEmail, String action) {
        log(tenantId, actorUserId, actorEmail, action, null, null, null);
    }

    public void log(
            UUID tenantId, UUID actorUserId, String actorEmail, String action,
            String entityType, String entityId, String detail) {
        try {
            String tenantBusinessName = tenantId != null
                    ? tenantRepository.findById(tenantId).map(Tenant::getBusinessName).orElse(null)
                    : null;
            HttpServletRequest request = currentRequest();
            AuditLogEntry entry = new AuditLogEntry(
                    tenantId, tenantBusinessName, actorUserId, actorEmail, action,
                    entityType, entityId,
                    request != null ? request.getRemoteAddr() : null,
                    request != null ? request.getHeader("User-Agent") : null,
                    detail);
            auditLogRepository.save(entry);
        } catch (Exception e) {
            logger.warn("Failed to write audit log entry for action {}", action, e);
        }
    }

    private HttpServletRequest currentRequest() {
        RequestAttributes attrs = RequestContextHolder.getRequestAttributes();
        if (attrs instanceof ServletRequestAttributes servletAttrs) {
            return servletAttrs.getRequest();
        }
        return null;
    }
}
