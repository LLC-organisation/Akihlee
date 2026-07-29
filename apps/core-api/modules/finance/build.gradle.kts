plugins {
    id("org.springframework.boot")
}

dependencies {
    implementation(project(":modules:identity"))

    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-validation")

    // Square SDK
    implementation("com.squareup:square:38.1.0.20240717")

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
}
