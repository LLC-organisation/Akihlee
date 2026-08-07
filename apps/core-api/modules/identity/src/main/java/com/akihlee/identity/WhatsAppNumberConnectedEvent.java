package com.akihlee.identity;

/**
 * Published when a tenant successfully links a WhatsApp number, so modules
 * that don't (and shouldn't) depend on identity's internals — like the
 * documents module's Twilio integration — can react without a direct
 * compile-time dependency in this direction.
 */
public record WhatsAppNumberConnectedEvent(String phoneNumberDigitsOnly, String businessName) {
}
