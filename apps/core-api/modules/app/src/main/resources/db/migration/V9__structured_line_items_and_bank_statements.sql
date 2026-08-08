ALTER TABLE extracted_data ADD COLUMN document_type VARCHAR(20) NOT NULL DEFAULT 'RECEIPT';

CREATE TABLE bank_transactions (
    id UUID PRIMARY KEY,
    extracted_data_id UUID NOT NULL REFERENCES extracted_data (id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    transaction_date DATE NOT NULL,
    description VARCHAR(500),
    payee_or_payer VARCHAR(255),
    amount NUMERIC(14, 2) NOT NULL,
    type VARCHAR(20) NOT NULL,
    category VARCHAR(100),
    created_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_bank_transactions_extracted_data_id ON bank_transactions (extracted_data_id);
CREATE INDEX idx_bank_transactions_tenant_id ON bank_transactions (tenant_id);

-- line_items_json used to hold a JSON array of plain strings (one per
-- receipt line, e.g. '["Milk 250.00"]'). Line items are now structured
-- objects instead, so wrap any legacy string entries in place rather than
-- breaking existing rows the moment the new frontend parses them.
UPDATE extracted_data
SET line_items_json = (
    SELECT COALESCE(jsonb_agg(
        CASE
            WHEN jsonb_typeof(elem) = 'string'
                THEN jsonb_build_object('description', elem #>> '{}', 'totalPrice', 0)
            ELSE elem
        END
    ), '[]'::jsonb)::text
    FROM jsonb_array_elements(line_items_json::jsonb) AS elem
)
WHERE line_items_json IS NOT NULL
  AND line_items_json <> ''
  AND jsonb_typeof(line_items_json::jsonb) = 'array'
  AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(line_items_json::jsonb) AS e
      WHERE jsonb_typeof(e) = 'string'
  );
