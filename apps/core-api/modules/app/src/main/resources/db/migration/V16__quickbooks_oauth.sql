ALTER TABLE tenants ADD COLUMN quickbooks_access_token TEXT;
ALTER TABLE tenants ADD COLUMN quickbooks_refresh_token TEXT;
ALTER TABLE tenants ADD COLUMN quickbooks_realm_id VARCHAR(255);
ALTER TABLE tenants ADD COLUMN quickbooks_token_expires_at TIMESTAMP;
