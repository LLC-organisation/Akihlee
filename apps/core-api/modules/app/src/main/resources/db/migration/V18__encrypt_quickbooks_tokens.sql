-- QuickBooks access/refresh tokens switch from plaintext to AES-256-GCM
-- encrypted storage (AesGcmStringConverter) as of this version, to meet
-- Intuit's App Store security review requirement that these be encrypted
-- at rest. Existing plaintext values can't be read back through the new
-- converter, so they're cleared here rather than migrated in place — the
-- integration is new enough that affected tenants just reconnect via
-- "Connect with QuickBooks" once.
UPDATE tenants
SET quickbooks_access_token = NULL,
    quickbooks_refresh_token = NULL,
    quickbooks_token_expires_at = NULL
WHERE quickbooks_access_token IS NOT NULL
   OR quickbooks_refresh_token IS NOT NULL;
