# FutureSchool Engineering & Product Documentation Suite
**Version:** 2.0.0 | **Author:** Ashish Vollala | **Organization:** FutureSchool

Welcome to the official technical and product documentation library for **FutureSchool**. This documentation suite contains the complete system architecture, database models, user flows, API specifications, and operational runbooks for the platform.

---

## Documentation Index

| # | Document | File Link | Focus Area |
| :---: | :--- | :--- | :--- |
| **01** | **Product Requirements Document (PRD)** | [01_PRODUCT_REQUIREMENTS_DOCUMENT.md](01_PRODUCT_REQUIREMENTS_DOCUMENT.md) | Vision, problem statement, personas, core modules, and business KPIs. |
| **02** | **Technical Requirements Document (TRD)** | [02_TECHNICAL_REQUIREMENTS_DOCUMENT.md](02_TECHNICAL_REQUIREMENTS_DOCUMENT.md) | Architecture, tech stack (React 19, Spring Boot 3.5, Postgres 17), NFRs, SLA. |
| **03** | **App Flow Document** | [03_APP_FLOW_DOCUMENT.md](03_APP_FLOW_DOCUMENT.md) | User journeys, Mermaid sequence diagrams, state machines for all 4 roles. |
| **04** | **UI/UX Design Brief** | [04_UI_UX_DESIGN_BRIEF.md](04_UI_UX_DESIGN_BRIEF.md) | Design tokens, typography, color palette, Telugu bilingual rules, touch targets. |
| **05** | **Backend Schema Document** | [05_BACKEND_SCHEMA_DOCUMENT.md](05_BACKEND_SCHEMA_DOCUMENT.md) | Relational ERD, table dictionaries, foreign keys, Flyway V1–V12 history. |
| **06** | **API Integration & Specifications** | [06_API_INTEGRATION_AND_SPECIFICATIONS.md](06_API_INTEGRATION_AND_SPECIFICATIONS.md) | REST endpoints, payloads, Razorpay webhooks, WhatsApp Cloud API, DLT SMS. |
| **07** | **Security & Access Control** | [07_SECURITY_AND_ACCESS_CONTROL.md](07_SECURITY_AND_ACCESS_CONTROL.md) | Multi-tenant isolation, `ProductionSafetyCheck`, RBAC, MPIN hashing, DPDP Act. |
| **08** | **AI Guardrails Document** | [08_AI_GUARDRAILS_DOCUMENT.md](08_AI_GUARDRAILS_DOCUMENT.md) | Gemini API integration, PII redaction, teacher-in-the-loop, temperature tuning. |
| **09** | **Feature Ticket List** | [09_FEATURE_TICKET_LIST.md](09_FEATURE_TICKET_LIST.md) | Agile Scrum backlog, 10 Epics, user stories with acceptance criteria, story points. |
| **10** | **Deployment & Testing Document** | [10_DEPLOYMENT_AND_TESTING_DOCUMENT.md](10_DEPLOYMENT_AND_TESTING_DOCUMENT.md) | CI/CD pipeline, 82 Spring tests + 325 UI tests, Nginx config, disaster recovery. |

---

## Quick Technology Reference

- **Frontend:** React 19 · Vite 8 · Tailwind CSS v4 · TypeScript · PWA (Offline-capable)
- **Backend:** Spring Boot 3.5.16 · Java 21 LTS · Spring Data JPA · JJWT 0.12.5
- **Database:** PostgreSQL 17 · Flyway Core Migrations (V1..V12)
- **External Gateways:** Razorpay UPI Payments · Meta WhatsApp Cloud API · TRAI DLT SMS
- **Mobile Container:** Android TWA (Trusted Web Activity) wrapping PWA manifest
