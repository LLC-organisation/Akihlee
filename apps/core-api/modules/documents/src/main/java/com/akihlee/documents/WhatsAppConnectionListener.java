package com.akihlee.documents;

import com.akihlee.identity.WhatsAppNumberConnectedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Sends a one-off welcome message when a tenant links a WhatsApp number.
 * Lives here (not in identity, where the number gets linked) because
 * identity has no dependency on documents/Twilio — this module already
 * depends on identity, so listening for its event is the only direction
 * that doesn't create a cycle between the two.
 */
@Component
public class WhatsAppConnectionListener {

    private final WhatsAppService whatsAppService;

    public WhatsAppConnectionListener(WhatsAppService whatsAppService) {
        this.whatsAppService = whatsAppService;
    }

    @EventListener
    public void onWhatsAppNumberConnected(WhatsAppNumberConnectedEvent event) {
        whatsAppService.sendWelcomeMessage(event.phoneNumberDigitsOnly(), event.businessName());
    }
}
