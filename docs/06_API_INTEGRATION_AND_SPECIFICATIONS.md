# API Integration & Specifications Document
## FutureSchool: REST Endpoints, Payloads & Integration Contracts (no payment gateway)
**Document Version:** 2.0.0 | **Protocol:** REST over HTTPS (TLS 1.3) | **Owner:** Backend Lead / Ashish Vollala

---

## 1. Global Request & Response Standards

### 1.1 Base URLs
- **Production API:** `https://api.futureschool.in`
- **Development Local:** `http://localhost:5000`

### 1.2 Common HTTP Request Headers
```http
Content-Type: application/json
Accept: application/json
Authorization: Bearer <JWT_ACCESS_TOKEN>
X-School-Id: <UUID>                  # Optional: Tenant hint (extracted from JWT by default)
X-Device-Fingerprint: <HASH_STRING>  # For trusted mobile device MPIN validation
```

### 1.3 Standard JSON Response Wrappers

#### Success Response
```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2026-11-15T13:20:00Z"
}
```

#### Error Response
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "The 4-digit MPIN entered is incorrect. 2 attempts remaining.",
    "field": "mpin",
    "traceId": "req-98f2-841b"
  },
  "timestamp": "2026-11-15T13:20:00Z"
}
```

---

## 2. Authentication & Identity Endpoints

### 2.1 Request SMS OTP
`POST /api/auth/otp/request`
- **Rate Limit:** 3 requests per 10 minutes per mobile number.
- **Request Body:**
```json
{
  "mobile": "9876543210"
}
```
- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "message": "OTP delivered via SMS",
    "expiresInSeconds": 300
  }
}
```

### 2.2 Verify OTP
`POST /api/auth/otp/verify`
- **Request Body:**
```json
{
  "mobile": "9876543210",
  "code": "481920"
}
```
- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "tempToken": "eyJhbGciOi...",
    "requiresPinSetup": true,
    "user": {
      "id": "c8a14b09-291a-4d7a-8f3e-4d92a0194821",
      "name": "Rajesh Sharma",
      "role": "ROLE_PARENT"
    }
  }
}
```

### 2.3 Verify Parent 4-Digit MPIN
`POST /api/auth/parent/pin/verify`
- **Request Body:**
```json
{
  "mobile": "9876543210",
  "pin": "1984",
  "deviceFingerprint": "d83a9f7e21c83b..."
}
```
- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOi...",
    "tokenType": "Bearer",
    "expiresIn": 43200000,
    "wards": [
      {
        "studentId": "e2b19284-981a-4281-9b81-a83918291029",
        "name": "Ananya Sharma",
        "className": "Class 8 - A",
        "schoolName": "Gowtham Model School"
      }
    ]
  }
}
```

---

## 3. Parent Portal Endpoints

### 3.1 Fetch Ward Report Card (SCERT Telangana)
`GET /api/parent/wards/{studentId}/report-card?examWindow=SA_1`
- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "exam": "SA-1",
    "totalMarksScored": 521,
    "maxMarks": 600,
    "percentage": 86.83,
    "overallGrade": "A2",
    "result": "PASS",
    "subjects": [
      {
        "name": "Telugu",
        "internal": 18, "maxInternal": 20,
        "external": 69, "maxExternal": 80,
        "total": 87, "maxTotal": 100,
        "grade": "A2"
      },
      {
        "name": "General Science (Phy + Bio)",
        "internal": 13, "maxInternal": 20,
        "external": 68, "maxExternal": 80,
        "total": 81, "maxTotal": 100,
        "grade": "A1",
        "components": [
          { "name": "Physical Science", "internal": 9, "external": 35, "total": 44, "maxTotal": 50 },
          { "name": "Biological Science", "internal": 4, "external": 33, "total": 37, "maxTotal": 50 }
        ]
      }
    ],
    "teacherRemarks": "Strong overall performance. Keep practising Biology diagrams."
  }
}
```

---

## 4. Fee Collection (Offline Counter) — No Payment Gateway

> **Fee policy (current):** parents do not pay in the app. Fees are paid at the school fee counter or by the school's direct bank QR; finance staff record the collection in the Fee Desk (`POST /api/office/fees/cash`) and the system issues the receipt. Online gateway payments (Razorpay / UPI checkout) are **out of scope / deferred**; the backend denies `/api/parent/fees/orders/**` and `/api/payments/**`. See PRD Module 4.

### Record a counter collection: `POST /api/office/fees/cash`
- **Who:** Admin with the `FINANCE` permission (school-scoped by the session; parents get `403`).
- **Body:** `{ "studentId": "GVS-2027-0001", "amount": 6000, "note": "Counter slip 12" }`
- **Rules:** amount must be > 0 and not more than the outstanding balance; allocated to the oldest dues first.
- **Result:** the recorded payment with `receiptNo`, `method: "CASH_AT_OFFICE"`, `recordedByStaffId` and `allocations`; audited as `FEE_CASH_RECORDED`.
- **Does not** release any hall ticket (the Class Teacher releases after clearance).

### Parent read-only fee endpoints
- `GET /api/parent/fees/summary`: dues per instalment and academic year, paid, concessions, overdue.
- `GET /api/parent/fees/payments`: recorded receipts (and refunds) for the session's child only.

### Removed / denied (online payments are out of scope)
- `POST /api/parent/fees/orders`, `/api/parent/fees/orders/{id}/verify`, `/api/parent/fees/orders/{id}/confirm-mock`
- `POST /api/payments/razorpay/webhook` (and anything under `/api/payments/**`)

---

## 5. Meta WhatsApp Cloud API Integration Contract

### Dispatched by `AlertDispatcher.java`
- **Endpoint:** `POST https://graph.facebook.com/v21.0/{phone_number_id}/messages`
- **Header:** `Authorization: Bearer {WHATSAPP_TOKEN}`
- **Payload (`student_absent` Template):**
```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "919876543210",
  "type": "template",
  "template": {
    "name": "student_absent",
    "language": { "code": "en" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "Ananya Sharma" },
          { "type": "text", "text": "15-Nov-2026" },
          { "type": "text", "text": "Gowtham Model School" }
        ]
      }
    ]
  }
}
```
