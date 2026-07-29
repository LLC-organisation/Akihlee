plugins {
    id("org.springframework.boot")
}

dependencies {
    implementation(project(":modules:identity"))
    implementation(project(":modules:documents"))

    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-validation")

    runtimeOnly("org.postgresql:postgresql")
}

tasks.bootJar {
    archiveFileName.set("akihlee-api.jar")
}
