plugins {
    id("org.springframework.boot")
}

dependencies {
    implementation(project(":modules:identity"))
    implementation(project(":modules:documents"))

    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.flywaydb:flyway-core")
    implementation("org.flywaydb:flyway-database-postgresql")

    runtimeOnly("org.postgresql:postgresql")
}

tasks.bootJar {
    archiveFileName.set("akihlee-api.jar")
}

// Loads variables from the repo-root .env file into the bootRun process,
// since Spring Boot has no built-in .env support and the README's
// `cp .env.example .env` step assumes this happens automatically.
tasks.named<org.springframework.boot.gradle.tasks.run.BootRun>("bootRun") {
    doFirst {
        val envFile = rootProject.file("../../.env")
        if (envFile.exists()) {
            envFile.readLines().forEach { line ->
                val trimmed = line.trim()
                if (trimmed.isNotEmpty() && !trimmed.startsWith("#") && trimmed.contains("=")) {
                    val (key, value) = trimmed.split("=", limit = 2)
                    environment(key.trim(), value.trim())
                }
            }
        }
    }
}
