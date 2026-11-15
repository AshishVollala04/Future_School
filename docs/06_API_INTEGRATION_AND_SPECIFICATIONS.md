# API Integration & Specifications Document
## FutureSchool: REST Endpoints, Payloads, Webhooks & Gateway Contracts
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

## 4. Payment Gateway Webhook Specifications (Razorpay)

### Webhook Endpoint: `POST /api/payments/webhook`
- **Security Check:** Backend recalculates HMAC-SHA256 signature using `app.payments.razorpay.webhook-secret` and compares with `X-Razorpay-Signature` header.
- **Event:** `payment.captured`
```json
{
  "entity": "event",
  "account_id": "acc_Ox82k19...",
  "event": "payment.captured",
  "payload": {
    "payment": {
      "entity": {
        "id": "pay_NQ819b28a910",
        "amount": 1250000,
        "currency": "INR",
        "status": "captured",
        "order_id": "order_MN89128aa",
        "method": "upi",
        "vpa": "rajesh@okhdfcbank"
      }
    }
  }
}
```
- **Action Triggered:**
  1. Validates webhook signature.
  2. Updates `payment_orders` status to `COMPLETED`.
  3. Creates official record in `fee_payments` and decrements `fee_instalments.balance_due`.
  4. Generates signed digital PDF receipt and alerts parent via WhatsApp notification.

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
