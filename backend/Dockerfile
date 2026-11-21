# Multi-stage Dockerfile for FutureSchool Spring Boot Backend
FROM eclipse-temurin:21-jdk-jammy AS build
WORKDIR /workspace/app

# Cache dependencies
COPY mvnw .
COPY .mvn .mvn
COPY pom.xml .
RUN sed -i 's/\r$//' ./mvnw && chmod +x ./mvnw
RUN ./mvnw dependency:go-offline -B

# Build application JAR
COPY src src
RUN ./mvnw clean package -DskipTests

# Runtime stage
FROM eclipse-temurin:21-jre-jammy
WORKDIR /app

# Run as non-root user for security
RUN groupadd -r spring && useradd -r -g spring spring
USER spring:spring

COPY --from=build /workspace/app/target/*.jar app.jar

ENV PORT=5000
EXPOSE 5000

ENTRYPOINT ["java", "-Djava.security.egd=file:/dev/./urandom", "-jar", "app.jar"]
