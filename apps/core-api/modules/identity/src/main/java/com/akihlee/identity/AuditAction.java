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
    public static final String DOCUMENT_APPROVED = "DOCUMENT_APPROVED";
    public static final String DOCUMENT_REJECTED = "DOCUMENT_REJECTED";
    public static final String DOCUMENT_IMPORTED = "DOCUMENT_IMPORTED";
    public static final String DOCUMENT_DELETED = "DOCUMENT_DELETED";
    public static final String EXTRACTED_DATA_EDITED = "EXTRACTED_DATA_EDITED";
    public static final String BANK_TRANSACTION_EDITED = "BANK_TRANSACTION_EDITED";
    public static final String VENDOR_RULE_CREATED = "VENDOR_RULE_CREATED";
    public static final String VENDOR_RULE_DELETED = "VENDOR_RULE_DELETED";
    public static final String WHATSAPP_NUMBER_CONNECTED = "WHATSAPP_NUMBER_CONNECTED";
    public static final String WHATSAPP_NUMBER_DISCONNECTED = "WHATSAPP_NUMBER_DISCONNECTED";
    public static final String SQUARE_CONNECTED = "SQUARE_CONNECTED";
    public static final String SQUARE_DISCONNECTED = "SQUARE_DISCONNECTED";
    public static final String QUICKBOOKS_CONNECTED = "QUICKBOOKS_CONNECTED";
    public static final String QUICKBOOKS_DISCONNECTED = "QUICKBOOKS_DISCONNECTED";
    public static final String ACCOUNT_SUSPENDED = "ACCOUNT_SUSPENDED";
    public static final String ACCOUNT_REACTIVATED = "ACCOUNT_REACTIVATED";
}
