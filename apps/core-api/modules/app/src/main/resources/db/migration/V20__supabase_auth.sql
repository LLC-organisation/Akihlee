-- Supabase now owns credentials (see SupabaseJwtAuthenticationConverter /
-- UserProvisioningService) — a local user row is linked to its Supabase
-- identity by supabase_user_id instead of authenticating via password_hash.
-- password_hash is kept (nullable) rather than dropped outright until it's
-- confirmed nothing still reads it.
--
-- IF NOT EXISTS / DROP NOT NULL (a no-op when already nullable) make this
-- safe to run twice — it was applied directly against production ahead of
-- this code's deploy (to link the first two Supabase-migrated accounts;
-- see the identity migration's existing-user step) and must not fail when
-- Flyway runs it again for real on the next core-api deploy.
ALTER TABLE users ADD COLUMN IF NOT EXISTS supabase_user_id UUID UNIQUE;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
