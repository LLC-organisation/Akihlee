# Multi-stage build: compile with the JDK, run on the smaller JRE image.
FROM eclipse-temurin:21-jdk-alpine AS build
WORKDIR /app
COPY . .
RUN ./gradlew :modules:app:bootJar --no-daemon

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /app/modules/app/build/libs/akihlee-api.jar app.jar

# Render (and most PaaS hosts) inject PORT at runtime; application.yml's
# server.port already falls back to it when SERVER_PORT isn't set.
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
