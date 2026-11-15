# App Flow Document (User Journeys & State Transitions)
## FutureSchool: Complete User Experience & System Flows
**Document Version:** 2.0.0 | **Owner:** UX & Product Architecture / Ashish Vollala

---

## 1. Parent App User Flow

```mermaid
sequenceDiagram
    autonumber
    actor Parent as Parent / Guardian
    participant App as Parent PWA / Mobile App
    participant Auth as Auth & Session Service
    participant SMS as DLT SMS Gateway
    participant Core as Backend Core API
    participant PG as Razorpay / UPI

    Note over Parent,App: Phase 1: First-Time Onboarding
    Parent->>App: Opens App & Enters 10-digit Mobile Number
    App->>Auth: POST /api/auth/otp/request
    Auth->>SMS: Deliver 6-digit OTP via DLT Template
    SMS-->>Parent: SMS Received ("Your FutureSchool OTP is...")
    Parent->>App: Inputs 6-digit OTP
    App->>Auth: POST /api/auth/otp/verify
    Auth-->>App: OTP Validated + Issues Temporary Setup Token
    Parent->>App: Creates 4-Digit MPIN (e.g. 1984) & Confirms
    App->>Auth: POST /api/auth/parent/pin/setup
    Auth-->>App: MPIN Hashed & Saved; Issues Long-lived Trusted Device JWT

    Note over Parent,App: Phase 2: Daily 1-Tap Access
    Parent->>App: Opens App Next Morning
    App-->>Parent: Displays 4-Digit MPIN Pad (Zero OTP Needed)
    Parent->>App: Enters MPIN (4 taps)
    App->>Auth: Verify Local/Remote MPIN Challenge
    Auth-->>App: Unlocks Session & Loads Dashboard (< 1.2s)

    Note over Parent,App: Phase 3: Term Fee Clearance via UPI
    Parent->>App: Taps "Fees" Tab -> Views Term 2 Balance (₹12,500)
    Parent->>App: Clicks "Pay via UPI"
    App->>Core: POST /api/payments/orders/create
    Core->>PG: Generate Razorpay UPI Order
    PG-->>App: UPI Intent / QR Gateway
    Parent->>PG: Approves Payment via PhonePe / GPay / Paytm
    PG->>Core: Webhook: payment.captured (HMAC SHA-256 Verified)
    Core->>Core: Allocate Fee Ledger & Generate PDF Receipt
    Core-->>App: Instant Payment Success Confirmation
    Parent->>App: Downloads Official PDF Fee Receipt with QR Code
```

---

## 2. Teacher Daily Classroom Flow

```mermaid
flowchart TD
    Start([Teacher Opens App]) --> AuthCheck{Session Active?}
    AuthCheck -- No --> Login[Enter Mobile & Password / PIN]
    AuthCheck -- Yes --> Dashboard[Teacher Dashboard]
    Login --> Dashboard

    Dashboard --> PickClass[Select Assigned Class & Section: 8th Grade - A]
    PickClass --> ActionChoice{Choose Workflow}

    ActionChoice -->|Morning 08:30 AM| AttFlow[Daily Attendance Register]
    AttFlow --> OneTap["Tap 'Mark All Present' (Default)"]
    OneTap --> UncheckAbsentees[Uncheck Specific Absent Students: 2 Students]
    UncheckAbsentees --> SubmitAtt[Click 'Submit Attendance']
    SubmitAtt --> HoldTimer["10-Minute Buffer Hold Activated (Allows Correction)"]
    HoldTimer --> MetaAlert["Meta WhatsApp Cloud API Dispatches Absence Alert to Parents"]

    ActionChoice -->|Classroom Work| HWFlow[Homework Diary]
    HWFlow --> CreateHW[Select Subject + Type Description + Due Date]
    CreateHW --> BroadcastHW[Broadcast to Student & Parent Diaries]

    ActionChoice -->|Examination Window| MarksFlow[Marks Entry Workflow]
    MarksFlow --> SelectExam[Select Exam: SA-1 & Subject: General Science]
    SelectExam --> EnterSubMarks[Enter Physical Science 50 + Biology 50]
    EnterSubMarks --> AutoCompute[System Computes Total 100 & Telangana SCERT Grade]
    AutoCompute --> SubmitToCT[Submit to Class Teacher for Verification]
```

---

## 3. Academic 3-Tier Report Card Approval Workflow

To ensure total institutional integrity, student marks are never published directly to parents without strict multi-tier verification.

```mermaid
stateDiagram-v2
    [*] --> DRAFT : Subject Teacher Enters Raw Marks
    DRAFT --> CT_REVIEW : Subject Teacher Submits Gradebook
    CT_REVIEW --> DRAFT : Class Teacher Requests Correction (with Note)
    CT_REVIEW --> PRINCIPAL_REVIEW : Class Teacher Verifies & Signs Remarks
    PRINCIPAL_REVIEW --> CT_REVIEW : Principal Rejects / Flags Inconsistency
    PRINCIPAL_REVIEW --> APPROVED : Principal Approves Examination Window
    APPROVED --> PUBLISHED : Automated Release to Parent & Student Portals
    PUBLISHED --> [*]
```

---

## 4. Principal Leadership & Emergency Governance Flow

```mermaid
flowchart LR
    PLogin([Principal Sign-In]) --> Console[Principal Executive Console]
    Console --> KPI1[School-wide Attendance %]
    Console --> KPI2[Today's Online & Counter Fee Collection]
    Console --> KPI3[Pending Marks Approvals]
    Console --> KPI4[UDISE+ Readiness Audit]

    KPI1 --> Chronic[Flag Students with Attendance < 75%]
    KPI2 --> Defaulters[Filter Fee Defaulter Roster for Follow-up]
    KPI3 --> BatchVerify[1-Click Batch Verification of Class Gradebooks]
    KPI4 --> ExportUDISE[Generate Validated Ministry UDISE+ CSV]
```

---

## 5. Security & Authentication State Machine

```mermaid
stateDiagram-v2
    [*] --> UNREGISTERED
    UNREGISTERED --> OTP_CHALLENGE : Mobile Entered
    OTP_CHALLENGE --> UNREGISTERED : Expired (> 5 mins)
    OTP_CHALLENGE --> PIN_SETUP : Correct OTP Entered
    PIN_SETUP --> TRUSTED_SESSION : 4-Digit MPIN Confirmed

    TRUSTED_SESSION --> MPIN_LOCKED : 3 Consecutive Wrong MPIN Attempts
    MPIN_LOCKED --> OTP_CHALLENGE : Reset via SMS OTP Recovery
    TRUSTED_SESSION --> STEP_UP_AUTH : Sensitive Action (Fee Pay / Profile Edit)
    STEP_UP_AUTH --> TRUSTED_SESSION : MPIN Re-verified
```
