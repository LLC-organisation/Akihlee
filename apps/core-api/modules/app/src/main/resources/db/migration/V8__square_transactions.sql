CREATE TABLE square_transactions (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    external_id VARCHAR(255) NOT NULL UNIQUE,
    amount NUMERIC(19, 4) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    type VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    location_id VARCHAR(255),
    description VARCHAR(500),
    document_id UUID REFERENCES documents (id),
    transaction_date TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    reconciled BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_square_tx_tenant_id ON square_transactions (tenant_id);
CREATE UNIQUE INDEX idx_square_tx_external_id ON square_transactions (external_id);
