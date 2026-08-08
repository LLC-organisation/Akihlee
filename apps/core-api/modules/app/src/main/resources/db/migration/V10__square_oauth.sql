ALTER TABLE tenants ADD COLUMN square_access_token TEXT;
ALTER TABLE tenants ADD COLUMN square_refresh_token TEXT;
ALTER TABLE tenants ADD COLUMN square_merchant_id VARCHAR(255);
ALTER TABLE tenants ADD COLUMN square_token_expires_at TIMESTAMP;
