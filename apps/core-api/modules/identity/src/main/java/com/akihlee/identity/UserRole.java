package com.akihlee.identity;

/**
 * There's no self-service way to become ADMIN (register/invite endpoints
 * always create USER accounts) — promotion is a direct DB update, by
 * design, since exposing it via any API would be a privilege-escalation
 * risk. See README for the promotion command.
 */
public enum UserRole {
    USER,
    ADMIN
}
