plugins {
    id("org.springframework.boot")
}

dependencies {
    implementation(project(":modules:identity"))
    implementation(project(":modules:documents"))

    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    // SecurityContextHolder, to resolve the current user for list/mark-as-read
    // requests — identity/documents/finance all declare this themselves too
    // since Gradle's `implementation` scope doesn't leak transitively.
    implementation("org.springframework.boot:spring-boot-starter-security")

    // HTTP client for the Resend and Supabase Realtime Broadcast REST calls
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
