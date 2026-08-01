CREATE TABLE tenants (
    id UUID PRIMARY KEY,
    business_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE documents (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    filename VARCHAR(255) NOT NULL,
    storage_key VARCHAR(255) NOT NULL,
    content_type VARCHAR(255) NOT NULL,
    size_bytes BIGINT NOT NULL,
    checksum VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'UPLOADED',
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_documents_tenant_id ON documents (tenant_id);
