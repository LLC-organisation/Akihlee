plugins {
    id("org.springframework.boot")
}

dependencies {
    implementation(project(":modules:identity"))
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    // For reading the authenticated user off SecurityContextHolder when
    // attributing an audit log entry (identity's copy isn't exposed
    // transitively — Gradle's `implementation` visibility, not `api`)
    implementation("org.springframework.boot:spring-boot-starter-security")

    // For file storage
    implementation("software.amazon.awssdk:s3:2.26.20")
    implementation("software.amazon.awssdk:url-connection-client:2.26.20")

    // For publishing document-received events to the OCR worker
    implementation("com.google.cloud:google-cloud-pubsub:1.151.0")

    // For sending/receiving WhatsApp messages via Twilio
    implementation("com.twilio.sdk:twilio:10.9.2")

    // PostgreSQL
    runtimeOnly("org.postgresql:postgresql")

    // Test containers for integration tests
    testImplementation("org.testcontainers:testcontainers")
    testImplementation("org.testcontainers:postgresql")
    testImplementation("org.testcontainers:junit-jupiter")
    testImplementation("org.springframework.boot:spring-boot-testcontainers")
}
