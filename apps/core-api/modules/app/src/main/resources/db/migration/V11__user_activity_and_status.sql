ALTER TABLE users ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE;

-- Append-only presence signal: one row roughly every 5 minutes of
-- authenticated activity per user (see UserActivityService — throttled in
-- application code, not here). There's no logout/heartbeat event in this
-- app (stateless JWT), so "session duration" is reconstructed by bucketing
-- these pings into gap-based sessions (a new session starts after a >30min
-- gap) rather than tracked as discrete start/end events.
CREATE TABLE user_activity_pings (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users (id),
    tenant_id UUID NOT NULL,
    created_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_user_activity_pings_user_created ON user_activity_pings (user_id, created_at);
