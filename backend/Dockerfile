# Multi-stage Dockerfile for FutureSchool Spring Boot Backend
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /workspace/app

# Use Google Cloud Asia Maven Central CDN mirror so shared cloud builders never hit 429 rate limits
COPY .mvn/docker-settings.xml .mvn/docker-settings.xml
COPY pom.xml .
RUN mvn -B -ntp -s .mvn/docker-settings.xml dependency:resolve

# Build application JAR
COPY src src
RUN mvn -B -ntp -s .mvn/docker-settings.xml clean package -DskipTests

# Runtime stage
FROM eclipse-temurin:21-jre-jammy
WORKDIR /app

# Run as non-root user for security
RUN groupadd -r spring && useradd -r -g spring spring
USER spring:spring

COPY --from=build /workspace/app/target/*.jar app.jar

ENV PORT=5000
EXPOSE 5000

ENTRYPOINT ["java", "-XX:MaxRAMPercentage=65.0", "-XX:+UseSerialGC", "-XX:+ExitOnOutOfMemoryError", "-Djava.security.egd=file:/dev/./urandom", "-jar", "app.jar"]
