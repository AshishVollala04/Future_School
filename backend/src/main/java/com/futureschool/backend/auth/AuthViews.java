package com.futureschool.backend.auth;

import java.util.List;
import java.util.Map;

/** Response shapes, matching the frontend's types/session.ts. */
public final class AuthViews {

    private AuthViews() {
    }

    public record ChildView(String id, String name, String grade, String section, String rollNumber,
                            String schoolId, String schoolName, String board, String avatar) {
    }

    public record MembershipView(String membershipId, String role, String schoolId, String schoolName, String title, boolean requiresPin) {
    }

    /** requiresPin: the parent has a PIN, so parent/session needs it (not after a PIN-only sign-in on a trusted device). */
    public record ParentVerification(String ticket, String guardianName, List<ChildView> children, boolean requiresPin) {
    }

    public record StaffVerification(String ticket, String displayName, List<MembershipView> memberships) {
    }

    public record StaffFirstFactor(String ticket, OtpService.ChallengeView secondFactor) {
    }

    public record Quorum(long activeAdmins, boolean meetsMinimum) {
    }

    public record SessionView(String sessionId, String userId, String role, String schoolId, String studentId,
                              List<String> authMethods, long issuedAt, long expiresAt, String accessToken,
                              Map<String, Object> profile, List<String> adminPermissions, Quorum adminQuorum) {
    }

    public record StepUpToken(String stepUpToken, String purpose, long expiresAt) {
    }
}
