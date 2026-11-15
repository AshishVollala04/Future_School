# Multi-school backend

Runtime: Java 21, Spring Boot 3.5.16, PostgreSQL 17. Tests use in-memory H2.

## Sign-in (same model as the frontend)

| Who | Steps | Endpoints (`/api/auth/...`) |
|---|---|---|
| Parent | first time on a phone: mobile -> SMS OTP -> child -> set PIN. Then on that phone: PIN only -> child | `otp/request`, `parent/verify`, `parent/session`; `parent/pin-login` |
| Teacher | first time on a device: mobile -> SMS OTP -> PIN. Then on that device: PIN only | `otp/request`, `teacher/verify`, `teacher/session`; `teacher/pin-login` |
| Principal / Admin | school email + password -> email OTP -> choose school | `staff/password`, `staff/verify`, `staff/session` |

- OTP: 6 digits, stored only as an HMAC, 5-minute expiry, 5 wrong attempts, 30 s resend cooldown, max 3 resends, 5 requests per number per 15 min.
  - Requesting an OTP never reveals whether a number is registered.
- Each step returns a single-use ticket that grants no data access.
- Sessions are stored server-side, so `logout` and suspension end them immediately.
- A teacher teaches in **one school**. Registering a mobile that is already an active teacher, or reactivating an old teacher membership while another is active, is refused. Migration V5 also enforces it in the database (`uk_teacher_one_active_school`).
- Parents work the same way, but the PIN belongs to the **account** (children can be in several schools), stored on `user_accounts` (migration V8).
  - `parent/verify` returns `requiresPin`. `parent/session {ticket, studentId, pin?, forgotPin?}` checks the child first, then the PIN.
  - `POST parent/pin-login {deviceToken, pin}` returns the children and a `DEVICE,PIN` ticket; `parent/session` then asks no PIN.
  - `POST parent/device` trusts the phone. `GET` and `POST /api/parent/pin {pin, stepUpToken?}` show and set the PIN; changing it needs a fresh `PIN_CHANGE` OTP.
  - Until a parent has a PIN (or in a "Forgot PIN" session), everything except `/api/parent/pin` and `/api/auth/**` returns 403 `PIN_SETUP_REQUIRED`.
  - Trusted devices have a `kind`: a parent's device token does not work for teacher sign-in, and the other way round.
- Teacher sign-in without an SMS every time (SMS costs money):
  - The SMS code is needed only the first time on a device, on a new device, or for "Forgot PIN".
  - After an SMS sign-in with a PIN set, the app calls `POST teacher/device` (TEACHER, session opened with SMS_OTP). It returns a device token once; only its SHA-256 hash is stored (migration V7, `trusted_devices`).
  - Next time: `POST teacher/pin-login {deviceToken, pin}` opens a session with methods `DEVICE,PIN` and sends no SMS. A PIN-only session cannot trust another device.
  - A trusted device expires after 90 days. A teacher keeps at most 5. `POST teacher/device/forget {deviceToken}` ("Not you?") revokes one.
  - "Forgot PIN" or a locked PIN: `teacher/session {ticket, membershipId, forgotPin: true}` after the SMS code. It opens a `PIN_RESET` session that can only set a new PIN, with no second SMS. This also unlocks the PIN, so no Admin is needed.
  - Wrong PINs count together for SMS and PIN-only sign-in. After 5 the PIN is locked (`PIN_LOCKED`, 423), and the SMS ticket stays valid so "Forgot PIN" needs no new SMS.
- Teacher PIN (**required**, 4 digits). Once set, `teacher/session` needs `pin` after the OTP.
  - A teacher without one (first sign-in, or after an Admin reset) gets a session in which every request except `/api/staff/pin` and `/api/auth/**` returns 403 `PIN_SETUP_REQUIRED`. The app shows a "Set your sign-in PIN" screen.
  - `PIN_REQUIRED` and `PIN_INVALID` (with `attemptsRemaining`) keep the ticket, so the teacher can retype.
  - 5 wrong PINs in a row: `PIN_LOCKED` (423). It stays locked until an Admin resets it.
  - Only a BCrypt hash is stored (migration V6). The PIN is never returned, logged or audited.
  - Teacher: `GET /api/staff/pin` and `POST /api/staff/pin {pin, stepUpToken?}`. The first PIN needs no extra OTP. Changing it needs a fresh `SENSITIVE_STAFF_ACTION` OTP. It cannot be removed.
  - Refused PINs: 1111, 1234, 4321, and part of the mobile.
  - Admin with SECURITY: `GET /api/office/teacher-pins`, `POST /api/office/teacher-pins/{membershipId}/reset {reason, stepUpToken}`. A reset clears the PIN, revokes all the teacher's trusted devices and is audited. Use it only for a lost phone; a forgotten PIN is self-service.
- Paying a fee or authorising a pickup pass: a parent confirms with the PIN instead of an SMS code. `POST /api/auth/step-up/pin {purpose: PAYMENT | PICKUP_AUTHORIZATION, pin}` returns the same single-use, 2-minute token as the SMS step-up, and wrong PINs count towards the same 5-try lock. Staff actions and changing the PIN still use the SMS code. The app always offers "Use an SMS code instead".
- Audit log: `GET /api/governance/audit` (Admin with REPORTS), newest first. It is append-only.
- A parent session is for **one child**. `parent/switch` moves to another linked child, possibly in another school, and ends the old session.
- `step-up/request` and `step-up/verify` give a 2-minute, single-use token for sensitive actions.
- Password-only login no longer exists.
- `app.otp.dev-reveal=true` returns the code in the response for development (SMS/email delivery is not configured). It **must be false in production**.

## Parent app API (`/api/parent/...`, PARENT only)

There is no student id in any URL: the child always comes from the session (one school + one child).

| Endpoint | What |
|---|---|
| `GET fees/summary` | Instalments, concessions, paid, outstanding, next due (server-computed) |
| `GET fees/payments` | Receipts and refunds (a refund is its own record; the payment is kept) |
| `POST fees/orders` | `{instalments:[2]}` or `{amount:2000}`. The server decides the allocation (oldest due first, min ₹1,000) |
| `POST fees/orders/{id}/confirm-mock` | **Prototype** payment: needs `method` (UPI/CARD/NETBANKING) and a fresh `stepUpToken` for PAYMENT. Re-checks the dues. No card or UPI data is ever accepted |
| `GET attendance?days=30` | Morning/afternoon days. Today appears only once marked |
| `GET results` | Published results, CURRENT version first; superseded versions are kept; absent = `"AB"` |
| `GET hall-tickets` | Fee clearance (exam's rule) **and** Class Teacher release. Payment alone never releases |

Orders are single-use, expire after 15 minutes, and belong to one session and one child.

## Staff teaching API (`/api/staff/...`, Teacher / Principal / Admin)

`SecurityConfig` checks the role. Each service checks the relationship: Class Teacher of this class, or Subject Teacher of this subject.

| Area | Endpoints | Rules |
|---|---|---|
| Structure | `GET assignments`, `GET classes` | My Teaching and My Class Teacher Responsibility are kept separate |
| Attendance | `GET/POST attendance/register` | Class Teacher only; every student must be marked; no future dates or Sundays. Re-saving with changes needs `correctionReason` and is logged and audited. Parents see it at once (LATE counts as present) |
| Hall tickets | `GET hall-tickets`, `POST hall-tickets/release`, `POST hall-tickets/override` | Class Teacher releases only fee-cleared students. Principal override: fee-cleared, reason of 10+ characters, fresh SENSITIVE_STAFF_ACTION step-up, audited |
| Marks | `GET marks/my-sheets`, `GET/POST marks/sheet`, `GET marks/class-sheets`, `POST marks/review` | Subject Teacher edits only their own sheet in an OPEN assessment; absent = `"AB"`, never 0. Class Teacher accepts or returns each subject |
| Report cards | `POST report-cards/generate`, `GET report-cards`, `POST report-cards/remark`, `POST report-cards/submit`, `GET report-cards/principal`, `POST report-cards/decision` | Generate only when all subjects are accepted; every card needs a remark. The Principal approves or returns each card |
| Publish | `POST results/publish` | **Class Teacher only**, when every card is approved. Creates a new result version; older versions become SUPERSEDED. The Principal can never publish |

Audit events (`audit_events`) are append-only.

## Governance, corrections and the fee desk

**Changes needing the Principal** (`/api/governance/...`, Admin and Principal):
1. The Admin creates a draft with `POST drafts`, or changes it with `POST {id}/edit`.
   - Fee changes need the FINANCE permission; exam changes need ACADEMIC_OPS.
2. The Admin sends it with `POST {id}/submit`. The server validates it; invalid requests are refused.
3. The Principal decides with `POST {id}/decision`.
   - APPROVE needs a fresh SENSITIVE_STAFF_ACTION step-up token and records a SHA-256 fingerprint of the payload.
   - RETURN and REJECT need a note.
4. The Admin runs it with `POST {id}/execute`. The server validates again.
   - If the payload changed after approval, the request becomes EXECUTION_BLOCKED (code CHANGED_AFTER_APPROVAL) until it is approved again.

The Admin can never approve, and the Principal can never execute. Concessions and refunds are new records; the original payment is kept.

**Corrections to published marks** (`/api/corrections/...`, Teacher and Principal):
1. The Subject Teacher raises a correction on the CURRENT version of their own subject (a number from 0 to max, or `"AB"`).
2. The Class Teacher verifies it. They cannot verify a correction they raised themselves.
3. The Principal approves with a fresh OTP.
4. The Class Teacher republishes. This creates a **new version**; the old one becomes SUPERSEDED.

**Office fee desk** (`/api/office/fees/...`, Admin with FINANCE): look up fee accounts and record cash, allocated to the oldest dues first. Recording a payment never releases a hall ticket.

## Leave, substitution and timetables

| Flow | Endpoints | Rules |
|---|---|---|
| Student leave (Flow 1) | `GET/POST /api/parent/leave`, `POST /api/parent/leave/{id}/withdraw`; `GET /api/staff/leave/class`, `POST /api/staff/leave/{id}/decision` | The session child only. Up to 7 days back and 15 days long, no overlaps. Only that class's Class Teacher decides; rejecting needs a reason. Approved leave shows as a **hint** in the register and never marks attendance |
| Teacher leave (Flow 6) | `GET/POST /api/staff/my-leave`; `GET /api/staff/teacher-leave`, `POST /api/staff/teacher-leave/{id}/decision` | The Principal decides |
| Substitution | `GET/POST /api/staff/substitution`, `GET /api/staff/substitution/my-duties` | Admin with ACADEMIC_OPS, approved leave only. Offers only teachers who are **free**: not teaching that period, not on leave, not already substituting. Audited |
| Timetable | `GET /api/parent/timetable`, `GET /api/staff/my-periods?day=1..6` | Same weekly rotation as the frontend prototype |

## Communication

| Area | Endpoints | Rules |
|---|---|---|
| Notices | `GET /api/parent/notices`, `GET/POST /api/staff/notices` | Parents see notices for ALL plus their child's class, emergency first. Principal and Admin can post to any audience. A Class Teacher can post only to their own class, and never as an emergency |
| Messages | `GET /api/parent/messages/recipients`, `GET/POST /api/parent/messages`, `POST .../{id}/reply`; `GET /api/staff/messages`, `POST /api/staff/messages/{id}/reply` | A parent can message only the child's Class Teacher and Subject Teachers; there is no directory. A teacher sees and replies to threads addressed to them only. Messages are at most 1000 characters |
| Consent | `GET /api/parent/consents`, `POST /api/parent/consents/{id}` | One response per child, attributable to the guardian and final: a decline can never become consent from the app. Closed after the due date |
| Meetings | `GET /api/parent/meetings` | Read-only for now |
| Homework | `GET /api/parent/homework`; `GET/POST /api/staff/homework`, `POST /api/staff/homework/{id}/status` | Only the Subject Teacher of that class and subject posts it, and only they set each student's status (pending, submitted or checked). The due date cannot be in the past |

## Complaints, transport, pickup and staff access

| Area | Endpoints | Rules |
|---|---|---|
| Complaints (Flow 5) | `/api/parent/complaints` (+ `/{id}/confirm`, `/{id}/reopen`); `GET /api/staff/complaints`, `POST /api/staff/complaints/{id}/respond` | The session child only, at most 5 open. An Admin with COMPLAINTS replies, keeps working, or resolves. The parent confirms (closes) or reopens with a reason. SAFETY complaints are flagged to the Principal, who sees those. Nothing is deleted |
| Transport (Flow 4) | `/api/parent/transport` (+ `/requests`, `/requests/{id}/withdraw`); `/api/office/transport/routes`, `/requests`, `/requests/{id}/decision` | One pending request at a time. An Admin with TRANSPORT decides. **Seats are re-checked at approval** (a full route is refused). Approving never changes fees |
| Pickup passes | `GET /api/parent/pickup`, `POST /api/parent/pickup/passes`, `POST .../{id}/cancel`; `POST /api/staff/pickup/verify` | Issuing needs a fresh PICKUP_AUTHORIZATION OTP. The server creates an 8-character code, stores only its hash, and shows it **once**. The pass lasts 2 hours, **works once** at the gate, and is never valid in another school. At most 2 active passes per child |
| Staff access | `GET /api/office/staff`, `POST /api/office/staff/invite`, `POST /api/office/staff/{id}/status` | Admin with SECURITY only. The school keeps at least two active Admins, and you cannot change your own access. Suspending or reactivating needs a reason and an OTP; nothing is deleted. A suspended Admin cannot sign in |
| Invitations | `GET /api/auth/invitations/{token}`, `POST /api/auth/invitations/{token}/accept`, then `staff/verify` | Single use, 48 hours, tied to one email. The new password and access take effect **only after the email OTP** |

## How a request is scoped to one school

1. Sign in as above. The session response contains `accessToken`.
2. Every request sends `Authorization: Bearer <token>`. `JwtAuthenticationFilter` checks the account and the membership again on every request, then sets `TenantContext` from the token's school.
   - The school never comes from a header, query parameter or request body.
3. Every school table extends `TenantScopedEntity` (`@TenantId school_id`). Hibernate adds `school_id = <current school>` to every query and fills it in on insert.
4. `TenantSafeRepository` also routes `findById`, `existsById`, `save` and `delete` through school-filtered queries. Hibernate does not filter loads by primary key, and `MultiSchoolIsolationTest` caught that leak.
5. With no school in context, reads return nothing and writes are refused.

Access checks run in this order:
- **School:** the steps above.
- **Role:** `SecurityConfig`, based on the membership in the token.
- **Relationship:** `AccessPolicy`. A parent sees only their linked children in the chosen school.

Unknown routes are denied.

## Demo logins (`app.seed.demo-data=true`)

These are the same people as the frontend prototype (`Frontend/docs/PROTOTYPE_LOGINS.md`):

| Sign in with | Who |
|---|---|
| 9876543210 / 9876543211 (OTP) | Rajesh / Meena Sharma: Aarav + Ananya (GVS), Rohan (SJM) |
| 9848011111 (OTP) | Srinivas Reddy: Kavya (GVS) |
| 9848012345 (OTP) | Sarah Jenkins: teacher at GVS, no PIN yet, so she is asked to set one |
| 9848033333 (OTP) | J. Mary: teacher at SJM (a teacher teaches in one school) |
| 9848022222 (OTP + PIN 2580) | Raghavan Nair: teacher, GVS |
| principal@greenwoodvalley.edu.in / Greenwood@2026 | Principal, GVS |
| admin@greenwoodvalley.edu.in / Greenwood@2026 | Admin, GVS (Finance, Admissions, Security, Reports) |
| office@greenwoodvalley.edu.in / Greenwood@2026 | Admin, GVS (Academic ops, Transport, Complaints, Reports) |
| principal@stjudemodel.edu.in / StJude@2026 | Principal, SJM |

## Running locally

- Without Postgres (in-memory, data lost on stop): `./mvnw spring-boot:test-run -Dspring-boot.run.profiles=test`
- With Postgres: `./mvnw spring-boot:run`. **Back up the database first**, because the V2 migration runs.

To connect the frontend, create `Frontend/.env.local` with `VITE_BACKEND=api` and `VITE_API_BASE_URL=http://localhost:5000`.
- Sign-in, the parent app (fees, payments, attendance, results, hall tickets) and the teaching flow (attendance register, hall-ticket release, marks to publication, Principal report-card approval) then use this server.
- Also on the server: Admin to Principal approvals, corrections to published marks, the office fee desk, student and teacher leave, substitution, timetables, notices, messages, consent, meetings and homework.
- Also on the server: complaints, transport, pickup passes, staff access and invitations.
- Microsoft/Google sign-in for Principal and Admin runs on the server (OIDC code flow with PKCE, migration V9):
  - `GET idp/providers` lists the configured providers (empty until keys are set; the app shows only these buttons).
  - `POST idp/start {provider, email, inviteToken?}` returns the provider page; `POST idp/complete {state, code}` returns the email-code step (`staff/verify`).
  - Accounts are linked by subject (Microsoft `tid:oid`, Google `sub`). A new link is made only after the email code, through an invitation or for an existing Principal/Admin with that school email. How to get the keys: `MICROSOFT_GOOGLE_SIGN_IN.md`.
- Still prototype only: the platform console. Everything else in the app now runs on the server.

If a run fails with `UnsupportedClassVersionError`, your IDE compiled `target/` with a newer JDK. Use `./mvnw clean ...` and set the IDE's Java to 21.

## Existing database

`db/migration/V2__school_id_multitenancy.sql` runs with Flyway before Hibernate. It:
- adds `school_id` to every school table;
- labels all existing rows `GVS`;
- swaps the global unique keys for per-school ones;
- gives every existing account a GVS membership with its current role.

It never deletes anything. **Back up the database before the first run.**

## Behaviour changes

- A password is required and checked with bcrypt only. Plain-text matches no longer work.
- After 5 failed logins, the account is locked for 15 minutes.
- Account endpoints (`/api/auth/users`, `register`, `reset-password`, `toggle-status`) are Admin-only and limited to the Admin's own school.
  - `DELETE /api/auth/users/{loginId}` is removed. Suspend access instead.
  - The school must keep two active Admins.
  - A person who also belongs to another school cannot have their password reset by this school's Admin.
- Deleting students, teachers, parents or classes is refused.
- `/api/analytics/leaderboard` is removed. FutureSchool never ranks people.
- Accounts created automatically for new students, parents or teachers get a random password nobody knows, instead of the shared `password123`. The Admin issues one with reset-password.

## Going to production

1. **Back up** the database: `pg_dump -Fc -d futureschool -f futureschool.dump`.
2. Set the environment variables used by `application-prod.properties`:
   - database: `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`;
   - security: `JWT_SECRET` (64+ random characters) and `APP_ORIGIN`;
   - SMS: `SMS_GATEWAY_URL`, `SMS_GATEWAY_KEY`, `SMS_GATEWAY_BODY`;
   - email: `MAIL_HOST`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM`.
3. Start with `--spring.profiles.active=prod`. **The server refuses to start** if any of these are true:
   - OTP codes would be shown on screen;
   - demo accounts would be seeded;
   - SMS or email is not really configured;
   - the JWT secret is the development one;
   - CORS allows localhost.

**SMS:** use any DLT-registered gateway (Indian telecom rule). `SMS_GATEWAY_BODY` is a JSON template that must match your DLT-approved message. Its placeholders are `{{mobile}}` (10 digits), `{{code}}` and `{{minutes}}`.
- If the gateway refuses or is unreachable, the person sees "We could not send the code right now", and no challenge is kept.

**Email:** any SMTP provider (SES, SendGrid, Zoho, Google Workspace). It is used for Principal/Admin sign-in and staff step-up.

**Migrations:**
- V2 makes every table school-scoped.
- V3 copies sign-in mobiles from parent and teacher records onto accounts. It only copies a number when exactly one account would get it; other cases are left for the office to fix.
- V4 is the complete schema. It is idempotent: on an existing database it changes nothing, and on a new one it creates everything.

**Demo data in a real database:** development runs with `app.seed.demo-data=true` add the demo people (ACC-L-…, GRD-…, STF-T-…) and their known passwords. In production, suspend those accounts from *Admin → Staff access*. Do not reuse that database's demo logins.

**Schema ownership:** Flyway owns the schema. V4 holds the complete schema, generated from the entities and safe on both existing and new databases. Production runs with `ddl-auto=validate`, and the guard refuses anything else.
- Changing an entity means adding a new migration (V5, ...).
- Development still uses `update` for convenience. Before release, check the new migration by running once against a fresh database with `--spring.jpa.hibernate.ddl-auto=validate`.

