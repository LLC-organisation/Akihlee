CREATE TABLE audit_log (
    id UUID PRIMARY KEY,
    tenant_id UUID,
    tenant_business_name VARCHAR(255),
    actor_user_id UUID,
    actor_email VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id VARCHAR(100),
    ip_address VARCHAR(64),
    user_agent VARCHAR(512),
    detail VARCHAR(1000),
    created_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_audit_log_tenant_id ON audit_log (tenant_id);
CREATE INDEX idx_audit_log_actor_user_id ON audit_log (actor_user_id);
CREATE INDEX idx_audit_log_actor_email ON audit_log (actor_email);
CREATE INDEX idx_audit_log_action ON audit_log (action);
CREATE INDEX idx_audit_log_created_at ON audit_log (created_at);
