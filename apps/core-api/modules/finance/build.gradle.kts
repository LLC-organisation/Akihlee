plugins {
    id("org.springframework.boot")
}

dependencies {
    implementation(project(":modules:identity"))
    implementation(project(":modules:documents"))

    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-validation")

    // Square SDK. Pinned version note: the original "38.1.0.20240717" pin
    // doesn't exist on Maven Central (that date suffix belongs to a
    // different version, 40.1.1) — this module was never actually compiled
    // as part of a full build until it was wired into :modules:app, so the
    // bad coordinate was latent. 38.1.0.20240320 is the real release that
    // matches the intended version number.
    implementation("com.squareup:square:38.1.0.20240320")

    // HTTP client
    implementation("org.springframework.boot:spring-boot-starter-webflux")

    // PostgreSQL
    runtimeOnly("org.postgresql:postgresql")

    // Test containers
    testImplementation("org.testcontainers:testcontainers")
    testImplementation("org.testcontainers:postgresql")
    testImplementation("org.testcontainers:junit-jupiter")
    testImplementation("org.springframework.boot:spring-boot-testcontainers")
    testImplementation("org.mockito:mockito-core")

    // RabbitTemplate — only needed to @MockBean it when testing
    // SquareSyncService, which now depends on DocumentService (documents
    // module declares this as `implementation`, so it isn't exposed
    // transitively to modules that merely depend on `documents`).
    testImplementation("org.springframework.boot:spring-boot-starter-amqp")
}
