package com.futureschool.backend.controller;

import com.futureschool.backend.auth.AuthFlowException;
import com.futureschool.backend.auth.SignInService;
import com.futureschool.backend.dto.AccountDTO;
import com.futureschool.backend.entity.UserAccount;
import com.futureschool.backend.entity.UserRole;
import com.futureschool.backend.security.AccessPolicy;
import com.futureschool.backend.security.SchoolPrincipal;
import com.futureschool.backend.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@Tag(name = "Authentication & Users", description = "Sign-in, school selection and school-scoped account management")
public class AuthController {

    private final AuthService authService;
    private final SignInService signIn;
    private final com.futureschool.backend.auth.TrustedDeviceService devices;
    private final com.futureschool.backend.auth.IdpService idp;

    public AuthController(AuthService authService, SignInService signIn, com.futureschool.backend.auth.TrustedDeviceService devices,
                          com.futureschool.backend.auth.IdpService idp) {
        this.authService = authService;
        this.signIn = signIn;
        this.devices = devices;
        this.idp = idp;
    }

    // ================================================================ sign-in (public)

    private ResponseEntity<?> run(java.util.function.Supplier<Object> body) {
        try {
            return ResponseEntity.ok(body.get());
        } catch (AuthFlowException e) {
            Map<String, Object> err = new java.util.LinkedHashMap<>();
            err.put("success", false);
            err.put("error", e.getMessage());
            err.put("code", e.getCode());
            if (e.getAttemptsRemaining() != null) err.put("attemptsRemaining", e.getAttemptsRemaining());
            return ResponseEntity.status(e.getStatus()).body(err);
        }
    }

    private static String str(Map<String, String> b, String k) {
        return b == null ? null : b.get(k);
    }

    @PostMapping("/otp/request")
    @Operation(summary = "Send a sign-in OTP to a mobile (PARENT_LOGIN or TEACHER_LOGIN). Never reveals if the number is registered")
    public ResponseEntity<?> requestOtp(@RequestBody Map<String, String> b) {
        return run(() -> signIn.requestMobileOtp(str(b, "mobile"), str(b, "purpose")));
    }

    @PostMapping("/otp/resend")
    public ResponseEntity<?> resendOtp(@RequestBody Map<String, String> b) {
        return run(() -> signIn.resend(str(b, "challengeId")));
    }

    @PostMapping("/parent/verify")
    @Operation(summary = "Verify the parent OTP; returns linked children (all schools) and a ticket")
    public ResponseEntity<?> verifyParent(@RequestBody Map<String, String> b) {
        return run(() -> signIn.verifyParent(str(b, "challengeId"), str(b, "code")));
    }

    @PostMapping("/parent/session")
    @Operation(summary = "Open a parent session for ONE child (its school becomes the session school)")
    public ResponseEntity<?> parentSession(@RequestBody Map<String, String> b) {
        return run(() -> signIn.startParentSession(str(b, "ticket"), str(b, "studentId"), str(b, "pin"), "true".equals(str(b, "forgotPin"))));
    }

    @PostMapping("/teacher/verify")
    public ResponseEntity<?> verifyTeacher(@RequestBody Map<String, String> b) {
        return run(() -> signIn.verifyTeacher(str(b, "challengeId"), str(b, "code")));
    }

    @PostMapping("/teacher/session")
    public ResponseEntity<?> teacherSession(@RequestBody Map<String, String> b) {
        return run(() -> signIn.startTeacherSession(str(b, "ticket"), str(b, "membershipId"), str(b, "pin"), "true".equals(str(b, "forgotPin"))));
    }

    @PostMapping("/staff/password")
    @Operation(summary = "Principal/Admin: school email + password (first factor); an email OTP follows")
    public ResponseEntity<?> staffPassword(@RequestBody Map<String, String> b) {
        return run(() -> signIn.staffPassword(str(b, "email"), str(b, "password")));
    }

    @GetMapping("/invitations/{token}")
    @Operation(summary = "Look up an invitation (public): who it is for and when it expires")
    public ResponseEntity<?> invitation(@PathVariable String token) {
        return run(() -> signIn.getInvitation(token));
    }

    @PostMapping("/invitations/{token}/accept")
    @Operation(summary = "Accept an invitation: choose a password; an email OTP follows (complete with staff/verify)")
    public ResponseEntity<?> acceptInvitation(@PathVariable String token, @RequestBody Map<String, String> b) {
        return run(() -> signIn.acceptInvitation(token, str(b, "email"), str(b, "password")));
    }

    @GetMapping("/idp/providers")
    @Operation(summary = "Microsoft/Google sign-in options set up for this server (empty until keys are configured)")
    public ResponseEntity<?> idpProviders() {
        return ResponseEntity.ok(Map.of("providers", idp.enabledProviders()));
    }

    @PostMapping("/idp/start")
    @Operation(summary = "Principal/Admin: start Microsoft or Google sign-in; returns the provider page to open")
    public ResponseEntity<?> idpStart(@RequestBody Map<String, String> b) {
        return run(() -> idp.start(str(b, "provider"), str(b, "email"), str(b, "inviteToken")));
    }

    @PostMapping("/idp/complete")
    @Operation(summary = "After the provider redirected back: {state, code}. Returns the email-code step (complete with staff/verify)")
    public ResponseEntity<?> idpComplete(@RequestBody Map<String, String> b) {
        return run(() -> idp.complete(str(b, "state"), str(b, "code")));
    }

    @PostMapping("/staff/verify")
    public ResponseEntity<?> staffVerify(@RequestBody Map<String, String> b) {
        return run(() -> signIn.staffSecondFactor(str(b, "ticket"), str(b, "challengeId"), str(b, "code")));
    }

    @PostMapping("/staff/session")
    public ResponseEntity<?> staffSession(@RequestBody Map<String, String> b) {
        return run(() -> signIn.startStaffSession(str(b, "ticket"), str(b, "membershipId")));
    }

    // ================================================================ session (signed in)

    @PostMapping("/parent/switch")
    @Operation(summary = "Parent: switch to another linked child (may change school). Ends the current session")
    public ResponseEntity<?> switchChild(Authentication auth, @RequestBody Map<String, String> b) {
        SchoolPrincipal p = AccessPolicy.principal(auth);
        return run(() -> signIn.switchChild(p.session(), str(b, "studentId")));
    }

    @PostMapping("/parent/pin-login")
    @Operation(summary = "Parent on a trusted device: PIN only, no SMS. Returns the children and a ticket for parent/session")
    public ResponseEntity<?> parentPinLogin(@RequestBody Map<String, String> b) {
        return run(() -> devices.parentPinSignIn(str(b, "deviceToken"), str(b, "pin")));
    }

    @PostMapping("/parent/device")
    @Operation(summary = "Parent: trust this device for PIN-only sign-in (session opened with an SMS code, PIN set). Token returned once")
    public ResponseEntity<?> trustParentDevice(Authentication auth, @RequestBody(required = false) Map<String, String> b) {
        SchoolPrincipal p = AccessPolicy.principal(auth);
        return run(() -> devices.trust(p.account(), p.membership(), p.session(), b == null ? null : str(b, "label")));
    }

    @PostMapping("/teacher/pin-login")
    @Operation(summary = "Teacher on a trusted device: PIN only, no SMS (deviceToken + pin)")
    public ResponseEntity<?> teacherPinLogin(@RequestBody Map<String, String> b) {
        return run(() -> devices.pinSignIn(str(b, "deviceToken"), str(b, "pin")));
    }

    @PostMapping("/teacher/device")
    @Operation(summary = "Teacher: trust this device for PIN-only sign-in (session opened with an SMS code, PIN set). Token returned once")
    public ResponseEntity<?> trustDevice(Authentication auth, @RequestBody(required = false) Map<String, String> b) {
        SchoolPrincipal p = AccessPolicy.principal(auth);
        return run(() -> devices.trust(p.account(), p.membership(), p.session(), b == null ? null : str(b, "label")));
    }

    @PostMapping("/teacher/device/forget")
    @Operation(summary = "Stop trusting this device (the device token proves it)")
    public ResponseEntity<?> forgetDevice(@RequestBody Map<String, String> b) {
        devices.forget(str(b, "deviceToken"));
        return ResponseEntity.ok(Map.of("success", true));
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout(Authentication auth) {
        SchoolPrincipal p = AccessPolicy.principal(auth);
        if (p != null) signIn.revoke(p.session().getId());
        return ResponseEntity.ok(Map.of("success", true));
    }

    @PostMapping("/step-up/request")
    @Operation(summary = "Re-verify with an OTP before a sensitive action (PAYMENT, PICKUP_AUTHORIZATION, SENSITIVE_STAFF_ACTION)")
    public ResponseEntity<?> stepUpRequest(Authentication auth, @RequestBody Map<String, String> b) {
        SchoolPrincipal p = AccessPolicy.principal(auth);
        return run(() -> signIn.requestStepUp(p.session(), str(b, "purpose")));
    }

    @PostMapping("/step-up/verify")
    public ResponseEntity<?> stepUpVerify(Authentication auth, @RequestBody Map<String, String> b) {
        SchoolPrincipal p = AccessPolicy.principal(auth);
        return run(() -> signIn.verifyStepUp(p.session(), str(b, "challengeId"), str(b, "code")));
    }

    @PostMapping("/step-up/pin")
    @Operation(summary = "Parent: confirm a PAYMENT or PICKUP_AUTHORIZATION with the PIN instead of an SMS code (no SMS). Same single-use token")
    public ResponseEntity<?> stepUpPin(Authentication auth, @RequestBody Map<String, String> b) {
        SchoolPrincipal p = AccessPolicy.principal(auth);
        return run(() -> signIn.verifyStepUpWithPin(p.session(), p.role(), str(b, "purpose"), str(b, "pin")));
    }

    @GetMapping("/me")
    @Operation(summary = "Current person, school and role")
    public ResponseEntity<?> me(Authentication auth) {
        SchoolPrincipal p = AccessPolicy.principal(auth);
        if (p == null) return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        return ResponseEntity.ok(authService.getCurrentUser(p));
    }

    @PutMapping("/change-password")
    public ResponseEntity<?> changePassword(Authentication auth, @RequestBody Map<String, String> body) {
        try {
            authService.changePassword(AccessPolicy.principal(auth), body.get("oldPassword"), body.get("newPassword"));
            return ResponseEntity.ok(Map.of("success", true, "message", "Password changed"));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", safe(e, "Could not change password.")));
        }
    }

    // ---- Admin of the current school only (enforced in SecurityConfig and scoped in AuthService)

    @GetMapping("/users")
    @Operation(summary = "People with access to this school (optional role filter)")
    public ResponseEntity<List<AccountDTO>> users(@RequestParam(required = false) String role) {
        return ResponseEntity.ok(authService.listUsers(role));
    }

    @PostMapping("/register")
    @Operation(summary = "Create a person with access to this school")
    public ResponseEntity<?> register(@RequestBody Map<String, Object> body) {
        try {
            UserAccount account = new UserAccount();
            account.setLoginId((String) body.get("loginId"));
            account.setName((String) body.get("name"));
            account.setEmail((String) body.get("email"));
            account.setMobile(com.futureschool.backend.auth.SignInService.cleanMobile((String) body.get("mobile")));
            account.setStudentId((String) body.get("studentId"));
            account.setTeacherId((String) body.get("teacherId"));
            UserRole role = UserRole.valueOf(String.valueOf(body.get("role")).toUpperCase());
            return ResponseEntity.ok(authService.registerUser(account, role, (String) body.get("password"), (String) body.get("title")));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", safe(e, "Could not create the account.")));
        }
    }

    @PutMapping("/users/{loginId}/toggle-status")
    @Operation(summary = "Suspend / reactivate a person's access to this school (never deletes)")
    public ResponseEntity<?> toggle(Authentication auth, @PathVariable String loginId) {
        try {
            return ResponseEntity.ok(authService.toggleUserStatus(AccessPolicy.principal(auth), loginId));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", safe(e, "Could not change access.")));
        }
    }

    @PostMapping("/users/{loginId}/reset-password")
    public ResponseEntity<?> resetPassword(@PathVariable String loginId, @RequestBody(required = false) Map<String, String> body) {
        try {
            String pwd = authService.adminResetPassword(loginId, body != null ? body.get("newPassword") : null);
            return ResponseEntity.ok(Map.of("success", true, "loginId", loginId, "temporaryPassword", pwd));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", safe(e, "Could not reset the password.")));
        }
    }

    /** Only pass through messages we wrote; never internal exception text. */
    private static String safe(Exception e, String fallback) {
        return (e instanceof IllegalArgumentException || e instanceof org.springframework.security.core.AuthenticationException) && e.getMessage() != null
                ? e.getMessage() : fallback;
    }
}
