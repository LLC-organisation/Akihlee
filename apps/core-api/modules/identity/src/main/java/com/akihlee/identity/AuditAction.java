package com.akihlee.identity;

/**
 * Canonical action names written to the audit log — plain string constants
 * rather than an enum, since the column is a free-form VARCHAR and new
 * actions should be addable without a migration.
 */
public final class AuditAction {
    private AuditAction() {
    }

    public static final String REGISTER = "REGISTER";
    public static final String LOGIN_SUCCESS = "LOGIN_SUCCESS";
    public static final String LOGIN_FAILURE = "LOGIN_FAILURE";
    public static final String PASSWORD_CHANGE = "PASSWORD_CHANGE";
    public static final String PASSWORD_CHANGE_FAILURE = "PASSWORD_CHANGE_FAILURE";
    public static final String DOCUMENT_UPLOAD = "DOCUMENT_UPLOAD";
    public static final String DOCUMENT_STATUS_CHANGE = "DOCUMENT_STATUS_CHANGE";
    public static final String EXTRACTED_DATA_EDITED = "EXTRACTED_DATA_EDITED";
    public static final String WHATSAPP_NUMBER_CONNECTED = "WHATSAPP_NUMBER_CONNECTED";
    public static final String WHATSAPP_NUMBER_DISCONNECTED = "WHATSAPP_NUMBER_DISCONNECTED";
}
