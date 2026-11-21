# Technical Requirements Document (TRD)
## FutureSchool Architecture, Technical Specifications & Infrastructure
**Document Version:** 2.0.0 | **Owner:** Technical Lead / Ashish Vollala

---

## 1. System Architecture Overview

```mermaid
graph TB
    subgraph Client Layer
        ParentPWA["Parent Mobile PWA / Android TWA"]
        StaffPWA["Staff Mobile PWA / Android TWA"]
        AdminWeb["Principal & Admin Web Console"]
    end

    subgraph Edge & Security
        Nginx["Nginx Reverse Proxy + Let's Encrypt SSL"]
        RateLimit["Rate Limiter (Token Bucket / IP & Tenant)"]
    end

    subgraph Application Tier
        SpringBoot["Spring Boot 3.5.16 (Java 21 LTS)"]
        SecurityConfig["Spring Security + JJWT 0.12.5"]
        TenantFilter["TenantContext & SchoolTenantResolver"]
        ProdSafety["ProductionSafetyCheck Guard"]
    end

    subgraph Data Tier
        Postgres[(PostgreSQL 17 Relational DB)]
        Flyway["Flyway Migration Engine (V1..V12)"]
    end

    subgraph External Gateways
        Razorpay["Razorpay payments gateway (deferred / out of scope: fees are paid at the school counter)"]
        MetaCloud["Meta WhatsApp Cloud API (Graph v21.0)"]
        DLTSMS["TRAI DLT SMS Gateway (MSG91 / HTTP)"]
        IDP["Azure AD & Google Identity Services"]
    end

    Client Layer -->|HTTPS / WSS| Nginx
    Nginx --> RateLimit
    RateLimit --> SpringBoot
    SpringBoot --> SecurityConfig
    SecurityConfig --> TenantFilter
    TenantFilter --> Postgres
    Flyway -.->|Runs on Boot| Postgres
    SpringBoot -.-> Razorpay
    SpringBoot --> MetaCloud
    SpringBoot --> DLTSMS
    SpringBoot --> IDP
```

---

## 2. Technology Stack & Runtime Specifications

### 2.1 Frontend Specifications
| Component | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Framework** | React with TypeScript | React 19.0.1, TS 5.x | High-performance reactive UI rendering |
| **Build & Bundler** | Vite with Rollup | Vite 8.3.0 | Instant HMR, ESM bundling, dynamic code splitting |
| **Styling** | Tailwind CSS v4 | `@tailwindcss/vite` 4.3.3 | Atomic styling with mobile-first responsive breakpoints |
| **PWA Engine** | Service Worker + Web App Manifest | Custom PWA Manifest | Offline caching, home-screen installation, TWA containerization |
| **Localization** | `i18next` & `react-i18next` | 27.0.1 / 18.0.0 | Dynamic runtime switching between English and Telugu |
| **Icons & Animation** | Lucide React + Motion | Lucide 0.546.0, Motion 12.x | Lightweight SVG iconography and fluid micro-transitions |
| **Charts** | Recharts | 3.10.1 | Academic marks trends, attendance distribution graphs |

### 2.2 Backend Specifications
| Component | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Language & Runtime**| Java LTS | OpenJDK 21 LTS | Virtual threads support, memory management |
| **Framework** | Spring Boot | 3.5.16 | Core MVC REST API engine |
| **Security** | Spring Security + JJWT | JJWT 0.12.5 | Stateless Bearer token verification, RBAC, MPIN hashing |
| **ORM / Data Access** | Spring Data JPA / Hibernate | 6.x | Relational mapping, dialect configuration |
| **Connection Pool** | HikariCP | Default Spring Boot | Low-latency connection pool (min-idle: 10, max-pool: 30) |
| **Database Migrations**| Flyway Core | 10.x | Strict version-controlled schema evolution (V1 through V12) |

### 2.3 Database Specifications
- **Engine:** PostgreSQL 17.x
- **Character Encoding:** UTF-8 (`en_US.UTF-8`)
- **Timezone Enforcement:** UTC (`spring.jpa.properties.hibernate.jdbc.time_zone=UTC`)
- **Connection Isolation:** Read Committed
- **Multi-Tenant Mode:** Discriminator Column Pattern (`school_id UUID NOT NULL REFERENCES schools(id)`) enforced via Hibernate filter and `TenantSafeRepository`.

---

## 3. Key Non-Functional Requirements (NFRs)

### 3.1 Performance & Latency
- **API Response Time (p95):** $< 150 \text{ ms}$ for read endpoints; $< 250 \text{ ms}$ for transactional writes.
- **Parent App Startup:** Cold launch to interactive state in $< 1.2 \text{ s}$ on 4G mobile networks.
- **Attendance Batch Commit:** Marking an entire section roster (up to 60 students) must complete within a single database transaction in $< 180 \text{ ms}$.

### 3.2 Scalability & Resource Allocation
- **Target Load per Single Node:** 20,000 active students across 30 schools served by a single 4 vCPU, 8 GB RAM instance.
- **Database Indexing:** Mandatory compound indexes on `(school_id, class_id)`, `(school_id, roll_number)`, and `(school_id, student_id, academic_year)`.

### 3.3 Reliability & Availability
- **High Availability Target:** $99.9\%$ uptime during academic school hours (07:00 IST – 19:00 IST).
- **Graceful Degradation:** When offline, the PWA client caches student cards and attendance registers locally, queueing edits for synchronization upon network reconnection.
- **Zero-Downtime Migration:** Flyway migration scripts are backward-compatible; schema additions never drop columns during running transactions.

---

## 4. Hardware & Operating Environment Requirements

### 4.1 Production Host (Minimum Sizing)
- **CPU:** 4 vCPU (x86_64 or ARM64 Graviton/Ampere)
- **RAM:** 8 GB DDR4/DDR5 ECC RAM
- **Storage:** 80 GB NVMe SSD with automated daily encrypted snapshots
- **OS:** Ubuntu 22.04 LTS or 24.04 LTS x86_64
- **Ports:** 80 (HTTP redirect), 443 (HTTPS TLS 1.3), 5000 (Internal Spring Boot port bound to `127.0.0.1` only).

### 4.2 Client Hardware Compatibility
- **Android Support:** Android 8.0 (Oreo) and above via Chrome Custom Tabs / TWA.
- **iOS Support:** Safari iOS 15.0 and above with PWA Home Screen Installation.
- **Desktop Browsers:** Chrome 100+, Edge 100+, Firefox 100+, Safari 15+.
