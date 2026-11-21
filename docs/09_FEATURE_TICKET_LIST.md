# Feature Ticket List & Agile Backlog Document
## FutureSchool: Sprint Planning, Epics, User Stories & Acceptance Criteria
**Document Version:** 2.0.0 | **Framework:** Agile Scrum (2-Week Sprints) | **Owner:** Product Manager / Ashish Vollala

---

## 1. Backlog Summary by Priority

| Epic ID | Epic Title | P0 (Blockers) | P1 (High) | P2 (Medium) | Total Points |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **EPIC-01** | Production Infrastructure & Security Hardening | 4 | 1 | 0 | 21 SP |
| **EPIC-02** | ~~Live Razorpay Payment Gateway~~ (deferred / out of scope: offline counter fees) | 0 | 0 | 0 | 0 SP |
| **EPIC-03** | Real SMS Gateway (TRAI DLT) & OTP Delivery | 3 | 0 | 0 | 13 SP |
| **EPIC-04** | Meta WhatsApp Cloud API Parent Alerts | 0 | 3 | 1 | 16 SP |
| **EPIC-05** | Android Play Store Release & Keystore Signing | 0 | 3 | 1 | 14 SP |
| **EPIC-06** | Parent Portal & Telugu/English SCERT Cards | 1 | 3 | 2 | 20 SP |
| **EPIC-07** | Teacher Classroom Suite & Attendance Buffer | 1 | 2 | 2 | 15 SP |
| **EPIC-08** | Principal Governance, Hall Tickets & UDISE+ | 1 | 2 | 1 | 16 SP |
| **EPIC-09** | Transport GPS Live Bus Tracking | 0 | 1 | 3 | 13 SP |
| **EPIC-10** | Owner Multi-School Group Dashboard | 0 | 1 | 2 | 11 SP |
| **TOTAL** | | **10** | **16** | **12** | **139 SP** |

---

## 2. Detailed Ticket Specifications (Top Priority Sprints)

### Epic 01: Production Infrastructure & Security Hardening (P0)

#### `FS-101` [P0, 8 SP] Cloud VM Provisioning & PostgreSQL 17 Setup
- **Description:** Provision production cloud VM (Ubuntu 22.04 LTS, 4 vCPU, 8 GB RAM) and configure production PostgreSQL 17 instance with automated daily encrypted backups.
- **Acceptance Criteria:**
  - PostgreSQL 17 running on `127.0.0.1:5432` with non-root dedicated user `futureschool_prod`.
  - UTF-8 encoding and UTC timezone active.
  - Daily cron automated pg_dump snapshot configured with 14-day retention.

#### `FS-102` [P0, 5 SP] Production Nginx Reverse Proxy & SSL (Let's Encrypt)
- **Description:** Set up Nginx reverse proxy routing `app.futureschool.in` to frontend dist and `api.futureschool.in` to Spring Boot port 5000 with TLS 1.3.
- **Acceptance Criteria:**
  - A+ rating on SSL Labs; HTTP strictly redirected to HTTPS.
  - Rate limiting active on `/api/auth/` (max 5 requests per second per IP).

#### `FS-103` [P0, 5 SP] Enforce `ProductionSafetyCheck` & Rotate Secrets
- **Description:** Generate new 64-character cryptographic `JWT_SECRET` via `openssl rand -hex 64` and run Spring Boot with `--spring.profiles.active=prod`.
- **Acceptance Criteria:**
  - Backend refuses startup if demo seed, dev reveal, or dev JWT secret is active.
  - `spring.jpa.hibernate.ddl-auto` strictly validates schema against Flyway V1–V12.

---

### Epic 02: Online Payments (Razorpay / UPI) — DEFERRED, OUT OF SCOPE

> Not planned. PRD Module 4 sets the policy: fees are paid at the school counter or by the school's direct bank QR and recorded by finance staff in the Fee Desk. The backend denies the parent order and webhook endpoints. Do not re-enable without a new product decision. The tickets below are kept for history only.


#### ~~`FS-201`~~ [Deferred] Razorpay Institutional KYC & Webhook Registration
- **Description:** Submit school entity legal documents for Razorpay payment gateway approval and register webhook endpoint `https://api.futureschool.in/api/payments/webhook`.
- **Acceptance Criteria:**
  - Razorpay live API keys (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`) provisioned.
  - Webhook configured for `payment.captured` with HMAC-SHA256 signature verification.

#### ~~`FS-202`~~ [Deferred] UPI In-App Payment Flow & Step-up PIN
- **Description:** Connect parent fee checkout button to real Razorpay UPI order flow with step-up 4-digit MPIN verification before launching UPI intent.
- **Acceptance Criteria:**
  - Parent enters 4-digit MPIN $\rightarrow$ launches UPI app (PhonePe/GPay) $\rightarrow$ updates ledger upon webhook confirmation.
  - Zero manual reconciliation required by school bursar.

---

### Epic 03: Real SMS Gateway (TRAI DLT) (P0)

#### `FS-301` [P0, 5 SP] Register DLT Sender ID & OTP Content Template
- **Description:** Complete TRAI DLT registration (Jio / Airtel portal) for school sender ID (`FUTSCH`) and register approved OTP template.
- **Acceptance Criteria:**
  - Template approved: `"Your FutureSchool verification code is {#var#}. Valid for 5 minutes."`
  - Approved Entity ID and Template ID linked to SMS provider (MSG91 / Exotel).

#### `FS-302` [P0, 3 SP] Wire SMS HTTP Provider in `application-prod.properties`
- **Description:** Replace development log provider with live HTTP provider.
- **Acceptance Criteria:**
  - `app.otp.sms.provider=http` active.
  - End-to-end SMS OTP delivery to Indian mobile numbers verified in $< 6$ seconds.

---

### Epic 04: Meta WhatsApp Cloud API Integration (P1)

#### `FS-401` [P1, 8 SP] Meta WhatsApp Business API Number & Template Verification
- **Description:** Register verified WhatsApp Business account with dedicated school telephone number and get `student_absent` and `fee_reminder` templates approved.
- **Acceptance Criteria:**
  - Green tick verification initiated.
  - Both templates approved by Meta for English and Telugu locales.

#### `FS-402` [P1, 5 SP] 10-Minute Absence Hold-off Queue
- **Description:** Implement queue engine in `AlertService` delaying WhatsApp dispatch by exactly 10 minutes following teacher attendance submission.
- **Acceptance Criteria:**
  - If teacher changes absent mark to present within 10 minutes, the alert status switches to `CANCELLED` and no WhatsApp message is dispatched.

---

### Epic 05: Google Play Store Release (P1)

#### `FS-501` [P1, 5 SP] Production Keystore Signing & AAB Build
- **Description:** Generate permanent release keystore via `keytool` and build signed Android App Bundle (AAB) for Parent App and Staff App.
- **Acceptance Criteria:**
  - Both AABs signed with release keystore and verified with `apksigner`.
  - Assetlinks.json configured on domain for digital asset linking (zero URL bar in TWA).

#### `FS-502` [P1, 5 SP] Google Play Console Submission
- **Description:** Prepare Google Play Store listings in English and Telugu with app screenshots, privacy policy URL, and submit for production review.
- **Acceptance Criteria:**
  - Store listings submitted for both `FutureSchool - Parents` and `FutureSchool - Staff`.
