# FutureSchool: Feature Testing & Demonstration Guide
## Complete Manual Test Matrix, Demo Credentials & Execution Runbook
**Document Version:** 2.0.0 | **Author:** Ashish Vollala | **Target Audience:** Founders, Testers, Partners

---

## 1. Quickstart: How to Run the Codebase

You can run FutureSchool in **two modes**:

### Mode A: Fast Prototype Mode *(Recommended for Testing — Zero Setup)*
Runs 100% in your browser using the built-in offline seed database. **No PostgreSQL database or Java installation required.**
```bash
# 1. Open terminal in Frontend folder:
cd D:\SM1\_future_school_clean\Frontend

# 2. Install dependencies (if not already installed):
npm install

# 3. Start local development server:
npm run dev
```
Open **`http://localhost:3000`** in Chrome or Edge.

---

### Mode B: Full-Stack Mode *(Spring Boot API + PostgreSQL 17)*
Connects the React UI to the real Java REST API and live PostgreSQL database.
```bash
# Terminal 1: Backend
cd D:\SM1\_future_school_clean\backend
./mvnw spring-boot:run
# Backend API boots on http://localhost:5000

# Terminal 2: Frontend
cd D:\SM1\_future_school_clean\Frontend
# Point to live API:
echo "VITE_BACKEND=api" > .env.local
echo "VITE_API_BASE_URL=http://localhost:5000" >> .env.local
npm run dev
# Frontend boots on http://localhost:3000
```

---

## 2. Master Demo Credentials Cheat-Sheet

| Role | Login Method | Username / Mobile / Email | Password / PIN | Ward / Assignment |
| :--- | :--- | :--- | :--- | :--- |
| **Parent** | Mobile + OTP / MPIN | `9876543210` | Any 6-digit OTP $\rightarrow$ Set PIN (e.g. `1984`) | Rajesh Sharma (Father of Aarav 10-A, Ananya 6-B) |
| **Teacher** | Mobile + OTP / PIN | `9848012345` | Any 6-digit OTP (or PIN `2580` for `9848022222`) | Sarah Jenkins (Class Teacher 10-A, Science) |
| **Principal** | School Email + Password | `principal@greenwoodvalley.edu.in` | `Greenwood@2026` | Dr. Shashi Shekhar (Principal, Greenwood Valley) |
| **Admin / Bursar** | School Email + Password | `admin@greenwoodvalley.edu.in` | `Greenwood@2026` | S. Sundaram (Finance & Admissions) |
| **School Owner** | Direct Navigation / Auth | `http://localhost:3000/owner` | Owner Role Session | Multi-School Group Executive (GVS + SJM) |
| **Student** | Student Portal View | Ward Selector / Student View | Linked to Student Roster | Aarav Sharma (Class 10-A, Roll #18) |

---

## 3. Step-by-Step Test Scenarios by Dashboard

---

### TEST SCENARIO 1: Parent Mobile App & The "Hall Ticket Lock"
**Goal:** Verify 1-Tap MPIN login, multi-child switching, Telugu language toggle, SCERT report cards, and the automated **Hall Ticket Lock** when fees are pending.

1. **Sign In:**
   - Go to `http://localhost:3000/login`
   - Select **"Parent Portal"** $\rightarrow$ enter mobile `9876543210`.
   - In demo mode, enter any 6 digits (e.g. `123456`).
   - Create your 4-digit MPIN: `1984`.
2. **Test Multi-Child Switcher:**
   - Look at the top navigation bar. Tap the student selector pill.
   - Switch between **Aarav Sharma (Class 10-A)** and **Ananya Sharma (Class 6-B)**. Notice the dashboard updates instantly.
3. **Test Telugu Bilingual Toggle:**
   - Tap the language button (`EN / తెలుగు`) in the top right.
   - Verify all headers, tabs, and buttons smoothly switch to Telugu without text clipping.
4. **Test Telangana SCERT Report Cards:**
   - Tap the **"Academics"** tab at the bottom.
   - Swipe horizontally through the exam carousel: `FA-1` $\rightarrow$ `FA-2` $\rightarrow$ `SA-1`.
   - Notice **General Science (100 Marks)** expands to show:
     - *Physical Science:* 9/10 Internal + 35/40 External = 44/50
     - *Biology:* 4/10 Internal + 33/40 External = 37/50
     - *Total:* 81/100 (Grade A1).
5. **Test Fee Statement & Hall Ticket Lock:**
   - Tap the **"Fees"** bottom tab.
   - Notice: Total outstanding balance shows **₹12,500 pending**.
   - Notice the prominent warning card:
     > 🔒 **"Examination Hall Ticket Locked"**
     > *"Hall tickets remain locked until outstanding dues are cleared. Please pay at the school counter to unlock."*
   - Notice online payment gateways are disabled in favor of clear school counter guidance.

---

### TEST SCENARIO 2: Teacher Classroom Operations & Attendance
**Goal:** Verify 60-second attendance marking, 10-minute hold buffer, composite marks entry, and hall ticket clearance lock.

1. **Sign In as Faculty:**
   - Log out or open incognito window $\rightarrow$ Go to `http://localhost:3000/login`.
   - Select **"Teacher Portal"** $\rightarrow$ Enter mobile `9848012345` (Sarah Jenkins, Class Teacher 10-A).
2. **Test 60-Second Attendance Register:**
   - Click **"Attendance"** from the menu.
   - Select **Class 10-A**.
   - Notice all students default to **Present**.
   - Toggle Student #3 (Kavya Reddy) to **Absent**.
   - Click **"Submit Register"**.
   - Notice the **10-minute buffer alert** appears: *"Alert held for 10 minutes before WhatsApp notification is sent to parents."*
3. **Test Marks Entry Workflow:**
   - Go to **"Marks"** $\rightarrow$ Choose **Class 10-A** $\rightarrow$ Exam **SA-1** $\rightarrow$ Subject **General Science**.
   - Enter internal and external marks. Notice the system automatically sums Physical Science and Biology and calculates the SCERT Grade (`A1`, `B1`, etc.).
   - Click **"Submit to Class Teacher for Verification"**.
4. **Test Hall Ticket Release Gating:**
   - Go to **"Hall Ticket Release"** tab.
   - Look at the student list for Class 10-A:
     - For students with ₹0 pending: Button says **"Release Hall Ticket"** (Enabled).
     - For students with pending fees: Displays **`🔒 Fee Pending`** (Release button is strictly disabled!).

---

### TEST SCENARIO 3: Admin Fee Desk — Cash Clearance & Instant Unlock
**Goal:** Prove the core business workflow — Admin records counter cash payment $\rightarrow$ Hall Ticket automatically unlocks for the parent.

1. **Sign In as Administrator:**
   - Go to `http://localhost:3000/login`.
   - Select **"Admin / Principal"** $\rightarrow$ Login with:
     - Email: `admin@greenwoodvalley.edu.in`
     - Password: `Greenwood@2026`
2. **Record Counter Payment at Fee Desk:**
   - Click **"Fee Desk"** in the left sidebar.
   - In the search bar, type `Aarav Sharma` or admission number `GVS-2027-0001`.
   - Student's pending balance (₹12,500) appears.
   - Enter amount `12500` $\rightarrow$ Payment Mode: `Cash at Office` $\rightarrow$ Click **"Record Payment"**.
   - System immediately prints official receipt `#REC-2026-XXXX`.
3. **Verify the Auto-Unlock Effect:**
   - Switch back to the **Parent Portal** or **Student Portal** for Aarav Sharma.
   - Go to the **Fees Tab**: Balance is now **₹0 (All Dues Cleared)**!
   - Go to **Hall Tickets**: The lock is gone! The Hall Ticket is now **ACTIVE & Available for Download/Print**!

---

### TEST SCENARIO 4: Principal Leadership & Emergency Governance
**Goal:** Verify executive KPI cards, 1-click batch report card publishing, and audited emergency overrides.

1. **Sign In as Principal:**
   - Email: `principal@greenwoodvalley.edu.in`
   - Password: `Greenwood@2026`
2. **Review Executive Console:**
   - Check the top KPI cards: Today's school attendance %, counter fee collections, pending teacher marks approvals.
3. **Test 1-Click Batch Report Card Publishing:**
   - Navigate to **"Report Card Approvals"**.
   - Review Class 10-A SA-1 gradebook.
   - Click **"Batch Approve & Publish to Parents"**.
   - Marks are instantly pushed live to all parent and student portals.
4. **Test Emergency Hall Ticket Override:**
   - Go to **"Hall Tickets"** $\rightarrow$ Find a student with special circumstances.
   - Click **"Principal Emergency Override"**.
   - Try entering 3 letters: System rejects it (*"Reason must be at least 10 characters"*).
   - Enter valid reason (*"Family medical emergency, fee approved for post-exam clearance"*).
   - Confirm step-up challenge $\rightarrow$ Ticket is released and logged in the immutable Governance Audit ledger.

---

### TEST SCENARIO 5: School Group Owner Dashboard
**Goal:** Cross-branch financial and operational comparison across school locations.

1. **Navigate to Owner Console:**
   - Open `http://localhost:3000/owner`.
2. **Test Multi-Branch Switcher:**
   - Switch between **Greenwood Valley School (GVS)** and **St. Jude Model School (SJM)**.
3. **Inspect Consolidated Metrics:**
   - Aggregate Fee Collections across all campuses.
   - Cross-campus attendance benchmark (identifies which branch has student retention issues).
   - Total enrolled student headcount and staff-to-student ratios.

---

### TEST SCENARIO 6: Student Portal & Admit Card Printing
**Goal:** Verify student examination admit card print styling and academic self-service.

1. **Access Student Workspace:**
   - Navigate to `http://localhost:3000/student/hall-ticket`.
2. **Print Hall Ticket:**
   - When unlocked, click **"Print Admit Card"**.
   - Notice the high-contrast, clean printable view formatted specifically for physical A4 printing with school header, timetable, room allocations, student photo slot, and principal signature stamp.
3. **Check Timetable & Homework:**
   - View weekly subject timetable and pending homework assignments.

---

## 4. Verification & Testing Checklist

Use this checklist during your test run:

- [ ] **Parent MPIN Setup:** Successfully set 4-digit PIN and logged in without OTP on subsequent attempt.
- [ ] **Telugu Localization:** Entire Parent portal switches to Telugu with zero text clipping.
- [ ] **SCERT Combined Science:** Physical Science (50) + Biology (50) sums accurately to 100.
- [ ] **Hall Ticket Lock:** Student with pending fee displays `🔒 Hall Ticket Locked`.
- [ ] **Admin Fee Desk:** Recording payment at office decrements balance to ₹0.
- [ ] **Auto-Unlock:** Hall ticket becomes downloadable the moment fee is marked cleared.
- [ ] **Teacher 60s Attendance:** Submitted whole section attendance with 10-min safety buffer.
- [ ] **Principal Batch Approve:** Published report cards in a single click.
- [ ] **Owner Multi-Branch:** Toggled between GVS and SJM branches with accurate metrics.
