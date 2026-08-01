package com.akihlee.documents;

import org.springframework.amqp.core.Queue;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RabbitMQConfig {

    public static final String DOCUMENTS_RECEIVED_QUEUE = "documents.received";

    /**
     * Declared here (not just assumed) so the queue exists regardless of
     * whether core-api or document-worker starts first.
     */
    @Bean
    public Queue documentsReceivedQueue() {
        return new Queue(DOCUMENTS_RECEIVED_QUEUE, true);
    }
}
