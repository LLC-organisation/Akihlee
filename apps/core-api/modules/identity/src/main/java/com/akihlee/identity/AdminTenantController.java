package com.akihlee.identity;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Admin-only tenant lookup (see SecurityConfig's /api/v1/admin/** gate) —
 * backs the audit log's tenant picker, where an admin searches by business
 * name or tenant id rather than needing the UUID memorized.
 */
@RestController
@RequestMapping("/api/v1/admin/tenants")
public class AdminTenantController {

    private final TenantRepository tenantRepository;

    public AdminTenantController(TenantRepository tenantRepository) {
        this.tenantRepository = tenantRepository;
    }

    @GetMapping
    public Page<AdminTenantSummary> search(
            @RequestParam(required = false) String search,
            @PageableDefault(size = 20, sort = "businessName", direction = Sort.Direction.ASC) Pageable pageable) {
        String searchPattern = search != null && !search.isBlank()
                ? "%" + search.toLowerCase() + "%"
                : null;
        return tenantRepository.search(searchPattern, pageable).map(AdminTenantSummary::from);
    }
}
