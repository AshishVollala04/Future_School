# Prototype / mock logins

Auth is mocked behind `AuthService` (`src/services/authService.ts` → `mockAuthService.ts`).
No SMS or email is sent. After you request a code, the screen shows it in a box labelled
**"Prototype / mock"**. Codes are random per request, expire after 5 minutes, lock after
5 wrong tries, and can be resent after 30 seconds (max 3 resends).

## Parent (mobile + OTP)
| Mobile | Guardian | Children |
|---|---|---|
| 98765 43210 | Rajesh Sharma (father) | Aarav 10-A (GVS), Ananya 6-B (GVS), Rohan 4-B (SJM) |
| 98765 43211 | Meena Sharma (mother) | same three children, so one child has two guardian mobiles |
| 98480 11111 | Srinivas Reddy | Kavya 9-A (GVS): one child, so no picker is shown |
| any other valid number | | "No students linked" |

## Teacher (mobile + OTP)
| Mobile | Teacher | Notes |
|---|---|---|
| 98480 12345 | Sarah Jenkins | GVS Class Teacher 10-A. No PIN yet: after the OTP she must set one, then it is asked every time |
| 98480 33333 | J. Mary | SJM Class Teacher 4-B |
| 98480 22222 | Raghavan Nair | One school, PIN **2580** |

## Principal / Admin (school email, always 2 factors)
| Email | Role | Microsoft / Google | Password |
|---|---|---|---|
| principal@greenwoodvalley.edu.in | Principal, GVS | Microsoft (linked) | Greenwood@2026 |
| admin@greenwoodvalley.edu.in | Admin, GVS (Finance, Admissions, Security, Reports) | Google (linked) | Greenwood@2026 |
| office@greenwoodvalley.edu.in | Admin, GVS (Academic ops, Transport, Complaints, Reports) | Google account exists but is **not linked**, so SSO is refused | Greenwood@2026 |
| principal@stjudemodel.edu.in | Principal, SJM | Google (linked) | StJude@2026 |
| accounts@stjudemodel.edu.in | Admin, SJM | invited, not active yet | none |

Every route then sends an email OTP (the second factor).

**Invitation:** open `/login?invite=inv-sjm-accounts-7Q4K2`. Accept it with Google, or by setting a
password (10+ characters, letters and numbers). The link works once and expires after 48 hours.

**Reset the prototype:** clear site data in the browser.

## Demo: fee payment → hall ticket (Flow 3)
1. Parent `98765 43210` → Aarav. Home shows "SA-1 hall ticket on hold: ₹6,000 pending".
2. Fees → tick "2. Before SA-1" → Continue → Pay → enter the OTP → receipt.
3. Academics → Exams: fees **Cleared**, ticket **Not released** (payment alone never releases it).
4. Sign out → Teacher `98480 12345` → Hall Ticket Release (My Class) → Release Aarav.
5. Sign back in as the parent → Academics → Exams → Download hall ticket.
6. Switch to Ananya / Rohan: none of Aarav's data appears; Rohan is a different school.

Mock data resets daily so the relative dates (homework due, meeting tomorrow) stay meaningful.

## Demo: marks to published results (Flow 2)
1. Teacher `98480 12345` (Sarah Jenkins) → Marks entry → FA-2 Physical Science 10-A.
   Type marks; `a` or `AB` = absent (0 = attended, scored zero) → Submit to Class Teacher.
2. Teacher `98480 22222` + PIN `2580` (Raghavan Nair) → Marks entry → FA-2 Mathematics 10-A → Submit.
3. Sarah Jenkins → Marks review & report cards → accept (or return with a reason) each subject.
4. Generate report cards → add a remark per student → Send to Principal.
5. Principal `principal@greenwoodvalley.edu.in` / `Greenwood@2026` → Report Card Approvals → approve or return each card.
6. Sarah Jenkins → Publish (enabled only when all cards are approved). Parent → Academics → Exams shows FA-2.

## Demo: leave and attendance (Flow 1)
1. Parent → More → Leave request → send. 2. Sarah Jenkins → Leave requests → approve/reject (reason needed to reject).
3. Attendance register shows approved leave as a hint only; the teacher still marks it. Saving again with changes needs a reason (history kept).

## Demo: Principal portal
- Principal `principal@greenwoodvalley.edu.in` / `Greenwood@2026` → Action required & overview.
- **Admin requests:** open "Financial support concession" → Approve → OTP. Status becomes "Approved · Admin to execute".
  If the Admin edits it after approval, execution is blocked until it is approved again (Admin screens: next module).
- **Mark corrections (v1 → v2):** FA-1 Social Studies for Aarav (16 → 17) was raised by the subject teacher and verified by the
  Class Teacher. Approve → OTP. Then Sarah Jenkins → Result corrections → Republish new version.
  Parent → Academics → Exams shows the new version as Current; "Show earlier versions" keeps the old ones as Superseded.
- **Teacher leave:** Raghavan Nair has a pending training leave. Teachers apply under My Teaching → My leave.

## Demo: Admin portal

Menus depend on the Admin's permissions. The two GVS Admins have different ones.

1. **Execute an approved change.** Sign in as office@ (Academic ops). Open *Changes needing approval*, then "Move SA-1 start to 25 Nov", then **Execute**.
2. **Blocked after edit.** The Principal approves Kavya's concession (with OTP). Sign in as admin@ (Finance). Open the concession, choose **Edit (needs re-approval)**, change the amount and save. **Execute** is now blocked. Use **Submit again for approval**.
3. **Fee desk.** As admin@, open *Fee desk*, pick a student and record a cash payment. A receipt is created. The hall ticket still needs Class Teacher release.
4. **Hall-ticket clearance rule.** As office@, start a new request of type *Hall-ticket fee clearance rule*. It shows how many students would be fee-cleared. It needs Principal approval.
5. **Substitution (Flow 6).** As office@, open *Substitution*. K. Lakshmi's approved leave lists her periods with the teachers who are free. Assign Sarah Jenkins. Sarah's *Today* screen then shows "Substitution duty".
6. **Transport (Flow 4).** As office@, try to approve Kavya's Route 4 request. It is blocked because Route 4 is full (3/3). Reject it with a note. The parent can then request Route 7.
7. **Complaints (Flow 5).** The parent raises a complaint under More → Complaints. office@ replies and marks it resolved. The parent confirms, or reopens it with a reason. Safety complaints are flagged to the Principal.
8. **Staff access.** As admin@, try to suspend office@. It is blocked, because the school must keep at least two active Admins. Invite a new Admin to get an `/login?invite=…` link. Once that Admin accepts, suspending works (it needs an OTP and a reason).

## Signing in against the real backend

Create `Frontend/.env.local` with:

```
VITE_BACKEND=api
VITE_API_BASE_URL=http://localhost:5000
```

Start the backend; see `Backend/MULTI_SCHOOL.md`. The same logins work.

These come from the server:
- the parent app's fees, payments (with a server OTP), attendance, results and hall tickets;
- the teaching flow: attendance register, hall-ticket release and override, marks entry and review, report cards, Principal approval, publishing;
- Admin to Principal approvals (blocked if edited after approval), corrections to published marks (new versions), and the Admin fee desk;
- student leave and the register hint, teacher leave, substitution (free teachers only), and timetables;
- notices, messages (teachers reply in *Messages from parents*), consent (final), meetings, and homework (teachers post it in *Homework*);
- complaints, transport, one-time pickup passes (staff check them in *Admin → Pickup gate check*), and staff access with invitations.

Everything else also comes from the server. Differences from mock mode:
- The code is shown as "Prototype / development server".
- Parents sign in the same way. The PIN is for the whole account, so one PIN covers every child and school. The first sign-in on a phone asks to set it.
- Teacher sign-in uses SMS only when needed:
  - **First time on a device:** mobile, then SMS code, then set a PIN. The device is remembered.
  - **Next time on that device:** "Welcome back", PIN only, no SMS.
  - **Forgot PIN or locked after 5 tries:** "Forgot PIN?", then an SMS code, then set a new PIN.
  - **Not you? Use another number:** forgets the device.
  - An Admin with Security can reset a PIN under *Staff access* (for a lost phone). This also signs out every device.
- Microsoft/Google sign-in is not on the server yet. It shows a clear "not connected yet" message.

