CREATE TABLE quickbooks_transactions (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    external_id VARCHAR(255) NOT NULL UNIQUE,
    amount NUMERIC(19, 4) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    account_name VARCHAR(255),
    payee_name VARCHAR(255),
    description VARCHAR(500),
    document_id UUID REFERENCES documents (id),
    transaction_date TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    reconciled BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_quickbooks_tx_tenant_id ON quickbooks_transactions (tenant_id);
CREATE UNIQUE INDEX idx_quickbooks_tx_external_id ON quickbooks_transactions (external_id);
