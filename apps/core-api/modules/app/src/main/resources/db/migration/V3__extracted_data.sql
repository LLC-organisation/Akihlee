CREATE TABLE extracted_data (
    id UUID PRIMARY KEY,
    document_id UUID NOT NULL UNIQUE REFERENCES documents (id),
    tenant_id UUID NOT NULL,
    filename VARCHAR(255) NOT NULL,
    merchant_name VARCHAR(255),
    transaction_date DATE,
    total_amount NUMERIC(14, 2),
    currency VARCHAR(8),
    tax_amount NUMERIC(14, 2),
    line_items_json TEXT,
    raw_text TEXT,
    confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_extracted_data_tenant_id ON extracted_data (tenant_id);
