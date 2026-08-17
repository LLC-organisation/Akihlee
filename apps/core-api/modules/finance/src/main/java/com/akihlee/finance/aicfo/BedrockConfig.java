package com.akihlee.finance.aicfo;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.bedrockruntime.BedrockRuntimeClient;

@Configuration
public class BedrockConfig {

    /**
     * No explicit credentials here, unlike S3Config — the AWS SDK's default
     * credential provider chain picks up AWS_ACCESS_KEY_ID/
     * AWS_SECRET_ACCESS_KEY env vars automatically, and there's no
     * MinIO-style endpoint override needed for a real AWS service.
     */
    @Bean
    public BedrockRuntimeClient bedrockRuntimeClient(@Value("${bedrock.region}") String region) {
        return BedrockRuntimeClient.builder()
                .region(Region.of(region))
                .build();
    }
}
