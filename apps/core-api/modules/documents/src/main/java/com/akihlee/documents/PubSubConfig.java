package com.akihlee.documents;

import com.google.api.gax.core.NoCredentialsProvider;
import com.google.api.gax.grpc.GrpcTransportChannel;
import com.google.api.gax.rpc.FixedTransportChannelProvider;
import com.google.cloud.pubsub.v1.Publisher;
import com.google.pubsub.v1.TopicName;
import io.grpc.ManagedChannel;
import io.grpc.ManagedChannelBuilder;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.IOException;
import java.util.concurrent.TimeUnit;

@Configuration
public class PubSubConfig {

    public static final String DOCUMENTS_RECEIVED_TOPIC = "documents-received";

    private Publisher publisher;
    private ManagedChannel emulatorChannel;

    /**
     * Application Default Credentials (Cloud Run's metadata server) are
     * used automatically — no host/port/username/password to configure,
     * unlike the RabbitMQ connection this replaces.
     *
     * Local dev is the one exception: the Pub/Sub emulator (see
     * infrastructure/docker/docker-compose.yml) needs an explicit
     * plaintext channel and no credentials, since Java's client — unlike
     * gcloud/Python — doesn't auto-detect PUBSUB_EMULATOR_HOST.
     */
    @Bean
    public Publisher documentsReceivedPublisher(@Value("${gcp.project-id}") String projectId) throws IOException {
        TopicName topicName = TopicName.of(projectId, DOCUMENTS_RECEIVED_TOPIC);
        Publisher.Builder builder = Publisher.newBuilder(topicName);

        String emulatorHost = System.getenv("PUBSUB_EMULATOR_HOST");
        if (emulatorHost != null && !emulatorHost.isBlank()) {
            emulatorChannel = ManagedChannelBuilder.forTarget(emulatorHost).usePlaintext().build();
            builder.setChannelProvider(
                            FixedTransportChannelProvider.create(GrpcTransportChannel.create(emulatorChannel)))
                    .setCredentialsProvider(NoCredentialsProvider.create());
        }

        this.publisher = builder.build();
        return this.publisher;
    }

    @PreDestroy
    public void shutdown() throws InterruptedException {
        if (publisher != null) {
            publisher.shutdown();
            publisher.awaitTermination(10, TimeUnit.SECONDS);
        }
        if (emulatorChannel != null) {
            emulatorChannel.shutdown();
        }
    }
}
