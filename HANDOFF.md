# FutureSchool: handoff for the next AI agent

Read this file first, then follow it.

## Product
A school management app for Telangana SSC schools, used by parents, teachers, the Principal and the Admin.
- `backend/`: Spring Boot 3.5, Java 21, PostgreSQL 17, Flyway migrations (V1 to V10). Runs on port 5000.
- `Frontend/`: React 19, Vite, Tailwind 4, i18next for English and Telugu. Runs on port 3000.
  - Start it with `VITE_BACKEND=api npx vite` to use the real server.
  - Without `VITE_BACKEND=api` it uses the mock services in `src/services/mock`.
- `website/`: the marketing site (Vite and React), deployed on Vercel. In Vercel, set Root Directory to `website`.
- Demo logins are in `Frontend/docs/PROTOTYPE_LOGINS.md`. The Admin login is admin@greenwoodvalley.edu.in / Greenwood@2026; in development the email code is shown on screen.

## Rules (the owner requires all of these)
1. After every change, run the checks and make sure they pass:
   - Backend: `cd backend && ./mvnw -o -q test` (H2 database, about 3 minutes, 85 tests).
   - Frontend: `cd Frontend && npx tsc --noEmit -p . && npm run build`.
2. Never say something works unless you ran it.
3. Never invent data. Demo or sample data must be labelled as demo or sample.
4. Show an absence as "AB".
5. Payments:
   - Never store card numbers, CVV, UPI PIN, OTP or bank passwords.
   - Payments are simulated until a real gateway is connected. Never claim a real payment.
6. Back up the database before running a new migration on the dev database:
   `pg_dump -U postgres -Fc -f backups/futureschool-<date>.dump futureschool`
7. Every schema change is a new Flyway file, `backend/src/main/resources/db/migration/V11__...sql`, and so on. Production runs with `ddl-auto=validate`.
8. Data is separated by school:
   - Every table has `school_id`, and entities extend `TenantScopedEntity`.
   - Never accept a school id from the client.
   - Background jobs use `TenantContext.runAs(schoolId, ...)`.
9. Permissions are checked on the server:
   - In the service, use `GovernanceService.requirePermission(p, "FINANCE")` and the checks in `Teaching`.
   - URL rules are in `security/SecurityConfig.java`.
   - Record important actions with `t.record(...)` so they appear in the audit log.
10. Git:
    - Use one branch per module, named like `module/26-...`. Commit and push each module separately to `origin` (https://github.com/AshishVollala04/Student-management-).
    - End every commit message with `Co-Authored-By: <your model name>`.
    - Never commit `Frontend/vite.config.ts`; it has a local change.
    - Never commit `.playwright-mcp/` or `outreach/`.
    - New backend files must be added under lowercase `backend/` (Windows shows the folder as `Backend/`).
11. Outreach emails go only from ashish.vollala.work@gmail.com, never from gaddamsharat@gmail.com.
12. Keep replies to the owner short; they read on a phone.

## Branch state (2026-11-11)
These PRs are not merged yet. Merge them in this order:
1. `module/23-parent-app-ui`
2. `module/24-website`
3. `module/25-whatsapp-alerts`

Each branch is based on the one before it.

## Done in module 25: WhatsApp alerts
- **Backend:** the `backend/.../alerts/` package (AlertService, AlertSender, AlertDispatcher, AlertController), migration V10, and the test `AlertFlowTest`.
- **How it is set up:**
  - `app.alerts.provider=log` is the default. Alerts are recorded as LOGGED and never delivered.
  - `whatsapp-cloud` uses the Meta Cloud API. The settings are documented in `application-prod.properties`.
- **Frontend:**
  - `/admin/alerts` and `/principal/alerts`, built from `AdminAlerts.tsx` and `alertService.ts`.
  - A parent on/off switch in `ParentMore.tsx`.
- **Use these as patterns:** follow the same structure (service, controller, test with `Api.java`, frontend service, page) for new modules.

## Next tasks, in priority order
Compared with competitor schoolites.com, these are what we are missing.
1. **Razorpay and UPI payments.**
   - Replace the simulated payment in `ParentDataService.confirmMockPayment` with Razorpay orders.
   - Verify the webhook signature, and keep the PIN step-up.
   - Keep the simulated mode for development, and store no card or UPI data.
2. **UDISE+ export.**
   - An Admin CSV or Excel export of student fields in UDISE+ format, with validation that lists rows with missing fields.
   - Students already have aadhaar, apaar, caste, mother tongue and district fields.
3. **Online admission form and enquiry tracking.**
   - A public admission form for each school.
   - An enquiry list for the office, with a button to convert an enquiry into a student.
4. **Play Store app.** Wrap the web app as a PWA, then use a TWA or Capacitor.
5. Later:
   - live bus GPS
   - biometric attendance devices
   - payroll (PF, ESI, TDS)
   - front office (visitors)
   - expense tracking
6. **Clean up the old student portal.**
   - `Frontend/src/modules/student/StudentAttendance.tsx` still uses the hardcoded `STUDENT_ATTENDANCE_OCTOBER`.
   - Read real data, or label it as demo.

Already our strengths: Telugu UI, SSC FA/SA marks, hall tickets released only after fees are paid, Principal approval with an audit trail, PIN sign-in on trusted devices.
