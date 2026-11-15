-- FutureSchool: give existing parent and teacher accounts the mobile number they sign in with.
--
-- Password-only sign-in was removed (parents and teachers use mobile + OTP). Accounts created
-- before that have no mobile on the account, but the number is on the parent / teacher record.
-- Copy it, cleaned to 10 digits, ONLY when it is a valid Indian mobile AND no other account
-- uses (or would use) the same number. Ambiguous numbers are left for the school office to fix.
-- Nothing is deleted. Safe on a fresh database (tables may not exist yet).

DO $$
BEGIN
    IF to_regclass('public.user_accounts') IS NULL THEN
        RETURN;
    END IF;
    IF to_regclass('public.parents') IS NULL OR to_regclass('public.teachers') IS NULL THEN
        RETURN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_accounts' AND column_name = 'mobile') THEN
        ALTER TABLE user_accounts ADD COLUMN mobile varchar(16);
    END IF;

    WITH candidates AS (
        SELECT u.id,
               right(regexp_replace(coalesce(p.mobile, t.phone, ''), '[^0-9]', '', 'g'), 10) AS m
        FROM user_accounts u
        LEFT JOIN parents p ON p.login_id = u.login_id
        LEFT JOIN teachers t ON t.teacher_id = u.teacher_id
        WHERE u.mobile IS NULL AND u.role IN ('PARENT', 'TEACHER')
    ), unique_candidates AS (
        SELECT c.id, c.m
        FROM candidates c
        WHERE c.m ~ '^[6-9][0-9]{9}$'
          AND (SELECT count(*) FROM candidates c2 WHERE c2.m = c.m) = 1
          AND NOT EXISTS (SELECT 1 FROM user_accounts o WHERE o.mobile = c.m)
    )
    UPDATE user_accounts u SET mobile = uc.m FROM unique_candidates uc WHERE u.id = uc.id;
END $$;
