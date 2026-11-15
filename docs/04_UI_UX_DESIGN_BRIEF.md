# UI/UX Design Brief & Design System Specification
## FutureSchool: Visual Language, Ergonomics & Accessibility
**Document Version:** 2.0.0 | **Owner:** Design Lead / Ashish Vollala

---

## 1. Design Philosophy: "One Calm Place"

Indian school applications are notoriously cluttered, overwhelming parents with ads, confusing menus, and walls of red notifications. FutureSchool adheres to the **"Calm Tech"** standard:
1. **Zero-Clutter Visual Hierarchy:** Crucial status indicators (attendance, today's timetable, fee balance) are visible within the first viewport fold without scrolling.
2. **One-Handed Thumb Ergonomics:** Primary navigation and high-frequency actions (attendance toggle, fee pay button, MPIN keypad) are positioned in the bottom 45% of the mobile screen.
3. **Bilingual Legibility:** Seamless typographic rendering in both English and Telugu without text truncation or broken line wrapping.

---

## 2. Color Palette & Theming Tokens

```
Primary Navy        #0F172A  (Slate 900) — Dominant brand, header, high-contrast text
Electric Blue       #2563EB  (Blue 600)  — Primary interactive action, links, tabs
Payoff Emerald      #10B981  (Emerald 500) — Pass grades, fee cleared, attendance present
Urgent Crimson      #EF4444  (Red 500)   — Absent status, overdue fee, emergency alerts
Highlight Amber     #FACC15  (Amber 400) — Pending verification, cautionary notices
Surface Light       #F8FAFC  (Slate 50)  — Main canvas background, low eye strain
Card Surface        #FFFFFF  (Pure White) — Elevated card containers with soft shadow
Border Subtle       #E2E8F0  (Slate 200) — Hairline separators, table borders
```

### 2.1 Contrast & Accessibility Standards
All foreground-to-background color pairings strictly comply with **WCAG 2.1 Level AA** standards:
- Body copy (`#0F172A` on `#FFFFFF`): Contrast ratio **14.2:1** (Exceeds 4.5:1 requirement).
- Interactive Blue buttons (`#FFFFFF` on `#2563EB`): Contrast ratio **4.6:1**.
- Alert Pill text (`#FFFFFF` on `#EF4444`): Contrast ratio **4.7:1**.

---

## 3. Typography Scale & Multilingual Adaptations

### 3.1 Type Families
- **English UI:** `Inter`, `Segoe UI`, `-apple-system`, `sans-serif`
- **Telugu UI:** `Noto Sans Telugu`, `Gautami`, `sans-serif`

### 3.2 Type Scale
| Token | Font Size | Line Height | Weight | Typical Application |
| :--- | :--- | :--- | :--- | :--- |
| `Display Hero` | 32 px (2.000 rem) | 40 px | Bold (700) | Greeting header ("Namaste, Rajesh garu") |
| `Title 1` | 24 px (1.500 rem) | 32 px | Bold (700) | Screen titles, Fee total amount |
| `Title 2` | 20 px (1.250 rem) | 28 px | Semi-bold (600) | Section cards, Student name |
| `Body Large` | 16 px (1.000 rem) | 24 px | Regular / Medium | Core data tables, form fields, notices |
| `Body Small` | 14 px (0.875 rem) | 20 px | Regular (400) | Secondary metadata, dates, roll numbers |
| `Caption / Pill`| 12 px (0.750 rem) | 16 px | Semi-bold (600) | Status badges ("Paid", "Absent", "A1 Grade")|

> [!IMPORTANT]
> **Telugu Typographic Rule:** Telugu script employs combining vowel diacritics (*matras* and *vattulu*) that extend above and below standard ASCII glyph heights. All container elements displaying localized Telugu strings must enforce `line-height: 1.55` (instead of standard `1.3`) to prevent vertical glyph clipping.

---

## 4. Mobile Component Patterns

### 4.1 Fixed 5-Tab Bottom Navigation Bar (Parent App)
Positioned permanently at `bottom: 0`, height `64px`, elevated with `box-shadow: 0 -2px 10px rgba(0,0,0,0.06)`:
1. 🏠 **Home:** Today's attendance status, bus ETA countdown, priority notice card.
2. 📖 **Academics:** Swipeable report cards (FA1 $\rightarrow$ Annual), homework diary, teacher remarks.
3. 💳 **Fees:** Term-wise fee breakdown, instant UPI checkout, PDF receipt history.
4. 💬 **Messages:** School circulars, teacher direct communication, consent forms.
5. ⚙️ **More:** Student profile, language switcher (English / తెలుగు), helpdesk, logout.

### 4.2 Interactive 4-Digit MPIN Pad
- Numeric buttons sized at **$72 \times 72 \text{ px}$** with rounded circular touch targets ($36\text{px}$ radius).
- Tactile haptic feedback trigger on mobile browsers supporting `navigator.vibrate(20)`.
- Obfuscated PIN bullet indicators with smooth spring pop animation upon each digit entry.

### 4.3 Swipeable Examination Report Cards (SCERT Telangana)
- Horizontal carousel allowing fluid swiping across all 8 examination terms:
  `[FA-1]  [FA-2]  >> [SA-1] <<  [FA-3]  [FA-4]  [SA-2]  [Pre-Final]  [Annual]`
- Clear breakdown table for composite subjects:
  ```
  General Science (Phy + Bio)       81 / 100  [A1]
    ↳ Physical Science   9/10  35/40   44 / 50
    ↳ Biology            4/10  33/40   37 / 50
  ```

---

## 5. Touch Target Sizes & Responsive Layout Grid

- **Minimum Touch Target:** All buttons, icons, and interactive elements must measure at least **$48 \times 48 \text{ dp}$** with a minimum $8\text{px}$ safety margin between adjacent targets.
- **Form Inputs:** Height $52\text{px}$, border-radius $12\text{px}$, high-contrast placeholder text with explicit label element above.
- **Breakpoints:**
  - `Mobile (Portrait)`: $320\text{px} - 480\text{px}$ (1-column layout, bottom tabs)
  - `Tablet / Foldable`: $481\text{px} - 768\text{px}$ (Adaptive 2-column cards)
  - `Desktop Leadership`: $1024\text{px}+$ (Collapsible left sidebar navigation, multi-column dashboard tables)
