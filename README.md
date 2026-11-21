# FutureSchool — School Management Platform

A full-stack school management application connecting **Parents, Teachers, Principals, and Students** through a single mobile and web platform.

## Tech Stack
- **Frontend:** React 19, Vite 8, Tailwind CSS, TypeScript, PWA
- **Backend:** Spring Boot 3.5, Java 21, PostgreSQL 17, Flyway, JWT Auth
- **Mobile:** Android TWA (Progressive Web App wrapped as APK)
- **CI/CD:** GitHub Actions (backend tests + PostgreSQL migration checks + frontend typecheck)

## Project Structure

```
FutureSchool/
├── Frontend/          # React PWA — parent app, teacher app, principal dashboard
├── backend/           # Spring Boot REST API — 232 Java classes, Flyway V1-V11
├── .github/workflows/ # CI pipeline — 82 tests + PostgreSQL migration checks
├── DATABASE_DESIGN.md # Full database schema documentation
├── HANDOFF.md         # Developer onboarding guide
└── PRODUCT_REQUIREMENTS_DOCUMENT.md
```

## Features
- 📱 **Parent App** — 1-tap MPIN login, live attendance, homework, fee payments, SCERT report cards
- 👩‍🏫 **Teacher App** — Attendance, marks entry, homework, communication
- 🏫 **Principal Dashboard** — School analytics, UDISE+ export, staff management
- 💰 **Fee Management** — Term 1-4 fees per academic year, paid at the school counter and recorded by the fee office with official receipts (no in-app payment)
- 🌐 **Multi-tenant** — Supports multiple schools on one platform
- 🔐 **Secure Auth** — OTP + MPIN + Microsoft/Google SSO

## Getting Started

### Backend
```bash
cd backend
./mvnw spring-boot:run
# Runs on http://localhost:5000
# PostgreSQL required (see application.properties)
```

### Frontend
```bash
cd Frontend
npm install
npm run dev
# Runs on http://localhost:3000
```

See [HANDOFF.md](HANDOFF.md) for full setup instructions.
