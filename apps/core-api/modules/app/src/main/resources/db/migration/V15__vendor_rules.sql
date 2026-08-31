CREATE TABLE vendor_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    vendor_pattern VARCHAR(255) NOT NULL,
    type VARCHAR(16) NOT NULL,
    category VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vendor_rules_tenant_id ON vendor_rules(tenant_id);
