-- FutureSchool: make every school table school-scoped.
--
-- Runs BEFORE Hibernate (Flyway). Safe on both:
--   * an EXISTING single-school database: adds school_id, labels all existing rows 'GVS',
--     makes it NOT NULL, swaps global unique keys for per-school ones, and gives every
--     existing account a GVS membership with its current role;
--   * a FRESH database: tables do not exist yet, so the table steps are skipped and
--     Hibernate creates the tables with school_id.
-- Nothing is deleted.

CREATE TABLE IF NOT EXISTS schools (
    id         varchar(64)  PRIMARY KEY,
    name       varchar(200) NOT NULL,
    board      varchar(64)  NOT NULL DEFAULT 'TELANGANA_SSC',
    status     varchar(32)  NOT NULL DEFAULT 'ACTIVE',
    created_at timestamp(6)
);

CREATE TABLE IF NOT EXISTS school_memberships (
    id         varchar(64) PRIMARY KEY,
    account_id varchar(64) NOT NULL,
    school_id  varchar(64) NOT NULL,
    role       varchar(32) NOT NULL,
    title      varchar(128),
    active     boolean     NOT NULL DEFAULT true,
    created_at timestamp(6)
);
CREATE INDEX IF NOT EXISTS idx_membership_account ON school_memberships (account_id);
CREATE UNIQUE INDEX IF NOT EXISTS uk_membership_account_school_role ON school_memberships (account_id, school_id, role);

DO $$
DECLARE
    t text;
    r record;
    tables text[] := ARRAY[
        'academic_years', 'attendance_records', 'book_issue_records', 'calendar_events', 'certificate_records',
        'complaints_tickets', 'fee_transactions', 'homework_assignments', 'library_books', 'marks_records',
        'parent_teacher_meetings', 'parents', 'quizzes', 'school_classes', 'school_notices', 'school_settings',
        'staff_attendance_records', 'students', 'study_materials', 'subject_allocations', 'teachers',
        'timetable_slots', 'transport_routes'
    ];
    has_existing_data boolean := to_regclass('public.user_accounts') IS NOT NULL;
BEGIN
    -- The existing single school becomes GVS.
    IF has_existing_data THEN
        INSERT INTO schools (id, name, created_at) VALUES ('GVS', 'Greenwood Valley High School', now())
        ON CONFLICT (id) DO NOTHING;
    END IF;

    FOREACH t IN ARRAY tables LOOP
        IF to_regclass('public.' || t) IS NOT NULL THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS school_id varchar(64)', t);
            EXECUTE format('UPDATE %I SET school_id = %L WHERE school_id IS NULL', t, 'GVS');
            EXECUTE format('ALTER TABLE %I ALTER COLUMN school_id SET NOT NULL', t);
            EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (school_id)', 'idx_' || t || '_school', t);
        END IF;
    END LOOP;

    -- Global unique keys become per-school (two schools may both have receipt 1001, class 10-A ...).
    FOR r IN
        SELECT c.conname, c.conrelid::regclass::text AS tbl
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
        WHERE c.contype = 'u' AND array_length(c.conkey, 1) = 1
          AND (c.conrelid::regclass::text, a.attname::text) IN (
              ('students', 'admission_number'), ('parents', 'login_id'), ('teachers', 'teacher_id'),
              ('fee_transactions', 'receipt_number'), ('certificate_records', 'certificate_number'),
              ('complaints_tickets', 'ticket_number'))
    LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    END LOOP;
    IF to_regclass('public.school_classes') IS NOT NULL THEN
        EXECUTE 'ALTER TABLE school_classes DROP CONSTRAINT IF EXISTS idx_class_section';
    END IF;
    DROP INDEX IF EXISTS idx_student_adm_no CASCADE;
    DROP INDEX IF EXISTS idx_parent_login_id CASCADE;
    DROP INDEX IF EXISTS idx_teacher_id CASCADE;
    DROP INDEX IF EXISTS idx_fee_receipt CASCADE;
    DROP INDEX IF EXISTS idx_class_section CASCADE;

    IF to_regclass('public.students') IS NOT NULL THEN
        CREATE UNIQUE INDEX IF NOT EXISTS uk_student_school_adm ON students (school_id, admission_number);
    END IF;
    IF to_regclass('public.parents') IS NOT NULL THEN
        CREATE UNIQUE INDEX IF NOT EXISTS uk_parent_school_login ON parents (school_id, login_id);
    END IF;
    IF to_regclass('public.teachers') IS NOT NULL THEN
        CREATE UNIQUE INDEX IF NOT EXISTS uk_teacher_school_tid ON teachers (school_id, teacher_id);
    END IF;
    IF to_regclass('public.fee_transactions') IS NOT NULL THEN
        CREATE UNIQUE INDEX IF NOT EXISTS uk_fee_school_receipt ON fee_transactions (school_id, receipt_number);
    END IF;
    IF to_regclass('public.certificate_records') IS NOT NULL THEN
        CREATE UNIQUE INDEX IF NOT EXISTS uk_cert_school_number ON certificate_records (school_id, certificate_number);
    END IF;
    IF to_regclass('public.complaints_tickets') IS NOT NULL THEN
        CREATE UNIQUE INDEX IF NOT EXISTS uk_complaint_school_ticket ON complaints_tickets (school_id, ticket_number);
    END IF;
    IF to_regclass('public.school_classes') IS NOT NULL THEN
        CREATE UNIQUE INDEX IF NOT EXISTS uk_class_school_section ON school_classes (school_id, name, section);
    END IF;

    -- Every existing account keeps its current role, now as a GVS membership.
    IF has_existing_data THEN
        INSERT INTO school_memberships (id, account_id, school_id, role, title, active, created_at)
        SELECT 'MEM-' || u.id || '-GVS-' || u.role, u.id, 'GVS', u.role, NULL, u.active, now()
        FROM user_accounts u
        ON CONFLICT DO NOTHING;
    END IF;
END $$;
