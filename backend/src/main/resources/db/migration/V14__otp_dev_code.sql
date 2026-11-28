-- Store the generated dev/staging OTP code on otp_challenges when app.otp.dev-reveal=true
-- so multi-instance / staging environments always share the DB-backed dummy OTP safely.
ALTER TABLE otp_challenges
    ADD COLUMN IF NOT EXISTS dev_code VARCHAR(12);
