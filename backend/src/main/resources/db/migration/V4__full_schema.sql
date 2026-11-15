-- FutureSchool: the complete schema as a Flyway migration.
--
-- Generated from the JPA entities (Hibernate's PostgreSQL DDL) and made idempotent, so it is safe on:
--   * an EXISTING database built by Hibernate "update" (everything already exists: no-op);
--   * a NEW database (V2 already created a few tables with fewer columns: missing columns are added).
-- After this, production runs with spring.jpa.hibernate.ddl-auto=validate: Hibernate never changes
-- the schema; every change is a new migration. Nothing is dropped.

create table if not exists academic_years (
        end_date date not null,
        is_current boolean not null,
        start_date date not null,
        id varchar(64) not null,
        name varchar(64) not null,
        school_id varchar(64) not null,
        primary key (id)
    );

alter table academic_years add column if not exists end_date date not null;

alter table academic_years add column if not exists is_current boolean not null;

alter table academic_years add column if not exists start_date date not null;

alter table academic_years add column if not exists id varchar(64) not null;

alter table academic_years add column if not exists name varchar(64) not null;

alter table academic_years add column if not exists school_id varchar(64) not null;

create table if not exists assessments (
        max_external integer not null,
        max_internal integer not null,
        pass_percent integer not null,
        second_language_pass_percent integer not null,
        academic_year varchar(16) not null,
        status varchar(16) not null,
        name varchar(32) not null,
        grades_csv varchar(64) not null,
        school_id varchar(64) not null,
        id varchar(200) not null,
        second_language_subjects_csv varchar(200) not null,
        primary key (id)
    );

alter table assessments add column if not exists max_external integer not null;

alter table assessments add column if not exists max_internal integer not null;

alter table assessments add column if not exists pass_percent integer not null;

alter table assessments add column if not exists second_language_pass_percent integer not null;

alter table assessments add column if not exists academic_year varchar(16) not null;

alter table assessments add column if not exists status varchar(16) not null;

alter table assessments add column if not exists name varchar(32) not null;

alter table assessments add column if not exists grades_csv varchar(64) not null;

alter table assessments add column if not exists school_id varchar(64) not null;

alter table assessments add column if not exists id varchar(200) not null;

alter table assessments add column if not exists second_language_subjects_csv varchar(200) not null;

create table if not exists attendance_records (
        attendance_date date not null,
        created_at timestamp(6),
        roll varchar(16),
        status varchar(16) not null,
        class_id varchar(64) not null,
        id varchar(64) not null,
        recorded_by varchar(64),
        school_id varchar(64) not null,
        student_id varchar(64) not null,
        student_name varchar(128) not null,
        remarks varchar(255),
        primary key (id)
    );

alter table attendance_records add column if not exists attendance_date date not null;

alter table attendance_records add column if not exists created_at timestamp(6);

alter table attendance_records add column if not exists roll varchar(16);

alter table attendance_records add column if not exists status varchar(16) not null;

alter table attendance_records add column if not exists class_id varchar(64) not null;

alter table attendance_records add column if not exists id varchar(64) not null;

alter table attendance_records add column if not exists recorded_by varchar(64);

alter table attendance_records add column if not exists school_id varchar(64) not null;

alter table attendance_records add column if not exists student_id varchar(64) not null;

alter table attendance_records add column if not exists student_name varchar(128) not null;

alter table attendance_records add column if not exists remarks varchar(255);

create table if not exists attendance_registers (
        register_date varchar(10) not null,
        session varchar(16) not null,
        saved_at varchar(40) not null,
        class_id varchar(64) not null,
        saved_by varchar(64) not null,
        school_id varchar(64) not null,
        id varchar(200) not null,
        history_json varchar(20000) not null,
        marks_json varchar(20000) not null,
        primary key (id)
    );

alter table attendance_registers add column if not exists register_date varchar(10) not null;

alter table attendance_registers add column if not exists session varchar(16) not null;

alter table attendance_registers add column if not exists saved_at varchar(40) not null;

alter table attendance_registers add column if not exists class_id varchar(64) not null;

alter table attendance_registers add column if not exists saved_by varchar(64) not null;

alter table attendance_registers add column if not exists school_id varchar(64) not null;

alter table attendance_registers add column if not exists id varchar(200) not null;

alter table attendance_registers add column if not exists history_json varchar(20000) not null;

alter table attendance_registers add column if not exists marks_json varchar(20000) not null;

create table if not exists audit_events (
        actor_role varchar(32) not null,
        at varchar(40) not null,
        action varchar(64) not null,
        actor_id varchar(64) not null,
        school_id varchar(64) not null,
        target_id varchar(160) not null,
        id varchar(200) not null,
        reason varchar(500),
        details varchar(1000) not null,
        primary key (id)
    );

alter table audit_events add column if not exists actor_role varchar(32) not null;

alter table audit_events add column if not exists at varchar(40) not null;

alter table audit_events add column if not exists action varchar(64) not null;

alter table audit_events add column if not exists actor_id varchar(64) not null;

alter table audit_events add column if not exists school_id varchar(64) not null;

alter table audit_events add column if not exists target_id varchar(160) not null;

alter table audit_events add column if not exists id varchar(200) not null;

alter table audit_events add column if not exists reason varchar(500);

alter table audit_events add column if not exists details varchar(1000) not null;

create table if not exists auth_tickets (
        used boolean not null,
        expires_at bigint not null,
        kind varchar(32) not null,
        account_id varchar(64) not null,
        id varchar(64) not null,
        invite_token varchar(64),
        pending_password_hash varchar(100),
        methods varchar(128) not null,
        primary key (id)
    );

alter table auth_tickets add column if not exists used boolean not null;

alter table auth_tickets add column if not exists expires_at bigint not null;

alter table auth_tickets add column if not exists kind varchar(32) not null;

alter table auth_tickets add column if not exists account_id varchar(64) not null;

alter table auth_tickets add column if not exists id varchar(64) not null;

alter table auth_tickets add column if not exists invite_token varchar(64);

alter table auth_tickets add column if not exists pending_password_hash varchar(100);

alter table auth_tickets add column if not exists methods varchar(128) not null;

create table if not exists book_issue_records (
        due_date date not null,
        fine_amount float(53),
        issue_date date not null,
        return_date date,
        status varchar(32) not null,
        book_id varchar(64) not null,
        id varchar(64) not null,
        school_id varchar(64) not null,
        student_id varchar(64) not null,
        student_name varchar(128) not null,
        book_title varchar(255) not null,
        primary key (id)
    );

alter table book_issue_records add column if not exists due_date date not null;

alter table book_issue_records add column if not exists fine_amount float(53);

alter table book_issue_records add column if not exists issue_date date not null;

alter table book_issue_records add column if not exists return_date date;

alter table book_issue_records add column if not exists status varchar(32) not null;

alter table book_issue_records add column if not exists book_id varchar(64) not null;

alter table book_issue_records add column if not exists id varchar(64) not null;

alter table book_issue_records add column if not exists school_id varchar(64) not null;

alter table book_issue_records add column if not exists student_id varchar(64) not null;

alter table book_issue_records add column if not exists student_name varchar(128) not null;

alter table book_issue_records add column if not exists book_title varchar(255) not null;

create table if not exists bus_routes (
        capacity integer not null,
        fee_per_instalment bigint not null,
        vehicle_no varchar(32) not null,
        school_id varchar(64) not null,
        id varchar(96) not null,
        name varchar(128) not null,
        stops_json varchar(4000) not null,
        primary key (id)
    );

alter table bus_routes add column if not exists capacity integer not null;

alter table bus_routes add column if not exists fee_per_instalment bigint not null;

alter table bus_routes add column if not exists vehicle_no varchar(32) not null;

alter table bus_routes add column if not exists school_id varchar(64) not null;

alter table bus_routes add column if not exists id varchar(96) not null;

alter table bus_routes add column if not exists name varchar(128) not null;

alter table bus_routes add column if not exists stops_json varchar(4000) not null;

create table if not exists calendar_events (
        end_date date not null,
        start_date date not null,
        audience varchar(32),
        event_type varchar(32) not null,
        id varchar(64) not null,
        school_id varchar(64) not null,
        description TEXT,
        title varchar(255) not null,
        primary key (id)
    );

alter table calendar_events add column if not exists end_date date not null;

alter table calendar_events add column if not exists start_date date not null;

alter table calendar_events add column if not exists audience varchar(32);

alter table calendar_events add column if not exists event_type varchar(32) not null;

alter table calendar_events add column if not exists id varchar(64) not null;

alter table calendar_events add column if not exists school_id varchar(64) not null;

alter table calendar_events add column if not exists description TEXT;

alter table calendar_events add column if not exists title varchar(255) not null;

create table if not exists certificate_records (
        issue_date date not null,
        created_at timestamp(6),
        certificate_number varchar(64) not null,
        certificate_type varchar(64) not null,
        class_name varchar(64),
        id varchar(64) not null,
        school_id varchar(64) not null,
        student_id varchar(64) not null,
        issued_by varchar(128),
        student_name varchar(128) not null,
        purpose varchar(255),
        primary key (id),
        constraint uk_cert_school_number unique (school_id, certificate_number)
    );

alter table certificate_records add column if not exists issue_date date not null;

alter table certificate_records add column if not exists created_at timestamp(6);

alter table certificate_records add column if not exists certificate_number varchar(64) not null;

alter table certificate_records add column if not exists certificate_type varchar(64) not null;

alter table certificate_records add column if not exists class_name varchar(64);

alter table certificate_records add column if not exists id varchar(64) not null;

alter table certificate_records add column if not exists school_id varchar(64) not null;

alter table certificate_records add column if not exists student_id varchar(64) not null;

alter table certificate_records add column if not exists issued_by varchar(128);

alter table certificate_records add column if not exists student_name varchar(128) not null;

alter table certificate_records add column if not exists purpose varchar(255);

create table if not exists change_requests (
        status varchar(24) not null,
        kind varchar(32) not null,
        approved_hash varchar(64),
        payload_hash varchar(64) not null,
        prepared_by varchar(64) not null,
        school_id varchar(64) not null,
        id varchar(96) not null,
        prepared_by_name varchar(128) not null,
        title varchar(200) not null,
        payload_json varchar(4000) not null,
        history_json varchar(20000) not null,
        primary key (id)
    );

alter table change_requests add column if not exists status varchar(24) not null;

alter table change_requests add column if not exists kind varchar(32) not null;

alter table change_requests add column if not exists approved_hash varchar(64);

alter table change_requests add column if not exists payload_hash varchar(64) not null;

alter table change_requests add column if not exists prepared_by varchar(64) not null;

alter table change_requests add column if not exists school_id varchar(64) not null;

alter table change_requests add column if not exists id varchar(96) not null;

alter table change_requests add column if not exists prepared_by_name varchar(128) not null;

alter table change_requests add column if not exists title varchar(200) not null;

alter table change_requests add column if not exists payload_json varchar(4000) not null;

alter table change_requests add column if not exists history_json varchar(20000) not null;

create table if not exists class_notices (
        priority varchar(16) not null,
        published_at varchar(40) not null,
        published_by varchar(64) not null,
        school_id varchar(64) not null,
        id varchar(96) not null,
        title varchar(200) not null,
        audience_csv varchar(1000) not null,
        body varchar(2000) not null,
        primary key (id)
    );

alter table class_notices add column if not exists priority varchar(16) not null;

alter table class_notices add column if not exists published_at varchar(40) not null;

alter table class_notices add column if not exists published_by varchar(64) not null;

alter table class_notices add column if not exists school_id varchar(64) not null;

alter table class_notices add column if not exists id varchar(96) not null;

alter table class_notices add column if not exists title varchar(200) not null;

alter table class_notices add column if not exists audience_csv varchar(1000) not null;

alter table class_notices add column if not exists body varchar(2000) not null;

create table if not exists class_subject_teachers (
        class_id varchar(64) not null,
        school_id varchar(64) not null,
        staff_id varchar(64) not null,
        subject varchar(64) not null,
        staff_name varchar(128) not null,
        id varchar(200) not null,
        primary key (id)
    );

alter table class_subject_teachers add column if not exists class_id varchar(64) not null;

alter table class_subject_teachers add column if not exists school_id varchar(64) not null;

alter table class_subject_teachers add column if not exists staff_id varchar(64) not null;

alter table class_subject_teachers add column if not exists subject varchar(64) not null;

alter table class_subject_teachers add column if not exists staff_name varchar(128) not null;

alter table class_subject_teachers add column if not exists id varchar(200) not null;

create table if not exists complaint_cases (
        principal_informed boolean not null,
        category varchar(16) not null,
        status varchar(16) not null,
        created_at varchar(40) not null,
        raised_by_guardian_id varchar(64) not null,
        school_id varchar(64) not null,
        student_id varchar(64) not null,
        id varchar(96) not null,
        subject varchar(120) not null,
        raised_by_name varchar(128) not null,
        description varchar(1000) not null,
        log_json varchar(20000) not null,
        primary key (id)
    );

alter table complaint_cases add column if not exists principal_informed boolean not null;

alter table complaint_cases add column if not exists category varchar(16) not null;

alter table complaint_cases add column if not exists status varchar(16) not null;

alter table complaint_cases add column if not exists created_at varchar(40) not null;

alter table complaint_cases add column if not exists raised_by_guardian_id varchar(64) not null;

alter table complaint_cases add column if not exists school_id varchar(64) not null;

alter table complaint_cases add column if not exists student_id varchar(64) not null;

alter table complaint_cases add column if not exists id varchar(96) not null;

alter table complaint_cases add column if not exists subject varchar(120) not null;

alter table complaint_cases add column if not exists raised_by_name varchar(128) not null;

alter table complaint_cases add column if not exists description varchar(1000) not null;

alter table complaint_cases add column if not exists log_json varchar(20000) not null;

create table if not exists complaints_tickets (
        created_at timestamp(6),
        updated_at timestamp(6),
        priority varchar(16),
        status varchar(32) not null,
        submitted_by_role varchar(32),
        category varchar(64) not null,
        id varchar(64) not null,
        school_id varchar(64) not null,
        submitted_by_id varchar(64) not null,
        ticket_number varchar(64) not null,
        assigned_to varchar(128),
        submitted_by_name varchar(128),
        description TEXT not null,
        resolution TEXT,
        title varchar(255) not null,
        primary key (id),
        constraint uk_complaint_school_ticket unique (school_id, ticket_number)
    );

alter table complaints_tickets add column if not exists created_at timestamp(6);

alter table complaints_tickets add column if not exists updated_at timestamp(6);

alter table complaints_tickets add column if not exists priority varchar(16);

alter table complaints_tickets add column if not exists status varchar(32) not null;

alter table complaints_tickets add column if not exists submitted_by_role varchar(32);

alter table complaints_tickets add column if not exists category varchar(64) not null;

alter table complaints_tickets add column if not exists id varchar(64) not null;

alter table complaints_tickets add column if not exists school_id varchar(64) not null;

alter table complaints_tickets add column if not exists submitted_by_id varchar(64) not null;

alter table complaints_tickets add column if not exists ticket_number varchar(64) not null;

alter table complaints_tickets add column if not exists assigned_to varchar(128);

alter table complaints_tickets add column if not exists submitted_by_name varchar(128);

alter table complaints_tickets add column if not exists description TEXT not null;

alter table complaints_tickets add column if not exists resolution TEXT;

alter table complaints_tickets add column if not exists title varchar(255) not null;

create table if not exists consent_forms (
        due_on varchar(10) not null,
        school_id varchar(64) not null,
        id varchar(96) not null,
        title varchar(200) not null,
        class_ids_csv varchar(1000) not null,
        details varchar(2000) not null,
        primary key (id)
    );

alter table consent_forms add column if not exists due_on varchar(10) not null;

alter table consent_forms add column if not exists school_id varchar(64) not null;

alter table consent_forms add column if not exists id varchar(96) not null;

alter table consent_forms add column if not exists title varchar(200) not null;

alter table consent_forms add column if not exists class_ids_csv varchar(1000) not null;

alter table consent_forms add column if not exists details varchar(2000) not null;

create table if not exists consent_responses (
        decision varchar(16) not null,
        responded_at varchar(40) not null,
        guardian_id varchar(64) not null,
        school_id varchar(64) not null,
        student_id varchar(64) not null,
        consent_id varchar(96) not null,
        id varchar(96) not null,
        primary key (id),
        constraint uk_consent_response unique (school_id, consent_id, student_id)
    );

alter table consent_responses add column if not exists decision varchar(16) not null;

alter table consent_responses add column if not exists responded_at varchar(40) not null;

alter table consent_responses add column if not exists guardian_id varchar(64) not null;

alter table consent_responses add column if not exists school_id varchar(64) not null;

alter table consent_responses add column if not exists student_id varchar(64) not null;

alter table consent_responses add column if not exists consent_id varchar(96) not null;

alter table consent_responses add column if not exists id varchar(96) not null;

create table if not exists exam_windows (
        clearance_upto_instalment integer not null,
        starts_on varchar(10) not null,
        name varchar(32) not null,
        grades_csv varchar(64) not null,
        school_id varchar(64) not null,
        id varchar(96) not null,
        clearance_categories_csv varchar(200) not null,
        primary key (id)
    );

alter table exam_windows add column if not exists clearance_upto_instalment integer not null;

alter table exam_windows add column if not exists starts_on varchar(10) not null;

alter table exam_windows add column if not exists name varchar(32) not null;

alter table exam_windows add column if not exists grades_csv varchar(64) not null;

alter table exam_windows add column if not exists school_id varchar(64) not null;

alter table exam_windows add column if not exists id varchar(96) not null;

alter table exam_windows add column if not exists clearance_categories_csv varchar(200) not null;

create table if not exists fee_charges (
        instalment integer not null,
        amount bigint not null,
        due_on varchar(10) not null,
        category varchar(32) not null,
        school_id varchar(64) not null,
        student_id varchar(64) not null,
        id varchar(96) not null,
        label varchar(128) not null,
        primary key (id)
    );

alter table fee_charges add column if not exists instalment integer not null;

alter table fee_charges add column if not exists amount bigint not null;

alter table fee_charges add column if not exists due_on varchar(10) not null;

alter table fee_charges add column if not exists category varchar(32) not null;

alter table fee_charges add column if not exists school_id varchar(64) not null;

alter table fee_charges add column if not exists student_id varchar(64) not null;

alter table fee_charges add column if not exists id varchar(96) not null;

alter table fee_charges add column if not exists label varchar(128) not null;

create table if not exists fee_concessions (
        amount bigint not null,
        approved_on varchar(10) not null,
        kind varchar(32) not null,
        charge_id varchar(64) not null,
        school_id varchar(64) not null,
        id varchar(96) not null,
        primary key (id)
    );

alter table fee_concessions add column if not exists amount bigint not null;

alter table fee_concessions add column if not exists approved_on varchar(10) not null;

alter table fee_concessions add column if not exists kind varchar(32) not null;

alter table fee_concessions add column if not exists charge_id varchar(64) not null;

alter table fee_concessions add column if not exists school_id varchar(64) not null;

alter table fee_concessions add column if not exists id varchar(96) not null;

create table if not exists fee_instalments (
        number integer not null,
        due_on varchar(10) not null,
        label varchar(64) not null,
        school_id varchar(64) not null,
        id varchar(96) not null,
        primary key (id)
    );

alter table fee_instalments add column if not exists number integer not null;

alter table fee_instalments add column if not exists due_on varchar(10) not null;

alter table fee_instalments add column if not exists label varchar(64) not null;

alter table fee_instalments add column if not exists school_id varchar(64) not null;

alter table fee_instalments add column if not exists id varchar(96) not null;

create table if not exists fee_payment_allocations (
        amount bigint not null,
        charge_id varchar(96) not null,
        payment_id varchar(96) not null
    );

alter table fee_payment_allocations add column if not exists amount bigint not null;

alter table fee_payment_allocations add column if not exists charge_id varchar(96) not null;

alter table fee_payment_allocations add column if not exists payment_id varchar(96) not null;

create table if not exists fee_payment_orders (
        consumed boolean not null,
        amount bigint not null,
        expires_at bigint not null,
        school_id varchar(64) not null,
        session_id varchar(64) not null,
        student_id varchar(64) not null,
        id varchar(96) not null,
        allocations_json varchar(4000) not null,
        primary key (id)
    );

alter table fee_payment_orders add column if not exists consumed boolean not null;

alter table fee_payment_orders add column if not exists amount bigint not null;

alter table fee_payment_orders add column if not exists expires_at bigint not null;

alter table fee_payment_orders add column if not exists school_id varchar(64) not null;

alter table fee_payment_orders add column if not exists session_id varchar(64) not null;

alter table fee_payment_orders add column if not exists student_id varchar(64) not null;

alter table fee_payment_orders add column if not exists id varchar(96) not null;

alter table fee_payment_orders add column if not exists allocations_json varchar(4000) not null;

create table if not exists fee_payments (
        is_mock boolean not null,
        amount bigint not null,
        method varchar(32) not null,
        paid_at varchar(40) not null,
        paid_by_guardian_id varchar(64),
        receipt_no varchar(64) not null,
        recorded_by_staff_id varchar(64),
        school_id varchar(64) not null,
        student_id varchar(64) not null,
        id varchar(96) not null,
        provider_ref varchar(128) not null,
        primary key (id),
        constraint uk_payment_school_receipt unique (school_id, receipt_no)
    );

alter table fee_payments add column if not exists is_mock boolean not null;

alter table fee_payments add column if not exists amount bigint not null;

alter table fee_payments add column if not exists method varchar(32) not null;

alter table fee_payments add column if not exists paid_at varchar(40) not null;

alter table fee_payments add column if not exists paid_by_guardian_id varchar(64);

alter table fee_payments add column if not exists receipt_no varchar(64) not null;

alter table fee_payments add column if not exists recorded_by_staff_id varchar(64);

alter table fee_payments add column if not exists school_id varchar(64) not null;

alter table fee_payments add column if not exists student_id varchar(64) not null;

alter table fee_payments add column if not exists id varchar(96) not null;

alter table fee_payments add column if not exists provider_ref varchar(128) not null;

create table if not exists fee_refunds (
        amount bigint not null,
        status varchar(16) not null,
        created_at varchar(40) not null,
        payment_id varchar(64) not null,
        school_id varchar(64) not null,
        id varchar(96) not null,
        reason varchar(300) not null,
        primary key (id)
    );

alter table fee_refunds add column if not exists amount bigint not null;

alter table fee_refunds add column if not exists status varchar(16) not null;

alter table fee_refunds add column if not exists created_at varchar(40) not null;

alter table fee_refunds add column if not exists payment_id varchar(64) not null;

alter table fee_refunds add column if not exists school_id varchar(64) not null;

alter table fee_refunds add column if not exists id varchar(96) not null;

alter table fee_refunds add column if not exists reason varchar(300) not null;

create table if not exists fee_transactions (
        amount float(53) not null,
        payment_date date not null,
        created_at timestamp(6),
        payment_method varchar(32) not null,
        class_id varchar(64) not null,
        collected_by varchar(64),
        fee_head varchar(64) not null,
        id varchar(64) not null,
        receipt_number varchar(64) not null,
        school_id varchar(64) not null,
        student_id varchar(64) not null,
        student_name varchar(128) not null,
        transaction_reference varchar(128),
        remarks varchar(255),
        primary key (id),
        constraint uk_fee_school_receipt unique (school_id, receipt_number)
    );

alter table fee_transactions add column if not exists amount float(53) not null;

alter table fee_transactions add column if not exists payment_date date not null;

alter table fee_transactions add column if not exists created_at timestamp(6);

alter table fee_transactions add column if not exists payment_method varchar(32) not null;

alter table fee_transactions add column if not exists class_id varchar(64) not null;

alter table fee_transactions add column if not exists collected_by varchar(64);

alter table fee_transactions add column if not exists fee_head varchar(64) not null;

alter table fee_transactions add column if not exists id varchar(64) not null;

alter table fee_transactions add column if not exists receipt_number varchar(64) not null;

alter table fee_transactions add column if not exists school_id varchar(64) not null;

alter table fee_transactions add column if not exists student_id varchar(64) not null;

alter table fee_transactions add column if not exists student_name varchar(128) not null;

alter table fee_transactions add column if not exists transaction_reference varchar(128);

alter table fee_transactions add column if not exists remarks varchar(255);

create table if not exists hall_ticket_releases (
        override_at varchar(40),
        released_at varchar(40) not null,
        exam_id varchar(64) not null,
        override_by varchar(64),
        released_by varchar(64) not null,
        school_id varchar(64) not null,
        student_id varchar(64) not null,
        id varchar(96) not null,
        override_reason varchar(300),
        primary key (id),
        constraint uk_release_school_exam_student unique (school_id, exam_id, student_id)
    );

alter table hall_ticket_releases add column if not exists override_at varchar(40);

alter table hall_ticket_releases add column if not exists released_at varchar(40) not null;

alter table hall_ticket_releases add column if not exists exam_id varchar(64) not null;

alter table hall_ticket_releases add column if not exists override_by varchar(64);

alter table hall_ticket_releases add column if not exists released_by varchar(64) not null;

alter table hall_ticket_releases add column if not exists school_id varchar(64) not null;

alter table hall_ticket_releases add column if not exists student_id varchar(64) not null;

alter table hall_ticket_releases add column if not exists id varchar(96) not null;

alter table hall_ticket_releases add column if not exists override_reason varchar(300);

create table if not exists homework_assignments (
        assigned_date date not null,
        due_date date not null,
        created_at timestamp(6),
        status varchar(32),
        class_id varchar(64) not null,
        id varchar(64) not null,
        school_id varchar(64) not null,
        subject varchar(64) not null,
        teacher_id varchar(64),
        teacher_name varchar(128),
        attachment_url varchar(255),
        description TEXT,
        title varchar(255) not null,
        primary key (id)
    );

alter table homework_assignments add column if not exists assigned_date date not null;

alter table homework_assignments add column if not exists due_date date not null;

alter table homework_assignments add column if not exists created_at timestamp(6);

alter table homework_assignments add column if not exists status varchar(32);

alter table homework_assignments add column if not exists class_id varchar(64) not null;

alter table homework_assignments add column if not exists id varchar(64) not null;

alter table homework_assignments add column if not exists school_id varchar(64) not null;

alter table homework_assignments add column if not exists subject varchar(64) not null;

alter table homework_assignments add column if not exists teacher_id varchar(64);

alter table homework_assignments add column if not exists teacher_name varchar(128);

alter table homework_assignments add column if not exists attachment_url varchar(255);

alter table homework_assignments add column if not exists description TEXT;

alter table homework_assignments add column if not exists title varchar(255) not null;

create table if not exists homework_tasks (
        assigned_on varchar(10) not null,
        due_on varchar(10) not null,
        submission_type varchar(16) not null,
        class_id varchar(64) not null,
        school_id varchar(64) not null,
        subject varchar(64) not null,
        teacher_staff_id varchar(64) not null,
        id varchar(96) not null,
        teacher_name varchar(128) not null,
        title varchar(200) not null,
        instructions varchar(1000) not null,
        status_json varchar(20000) not null,
        primary key (id)
    );

alter table homework_tasks add column if not exists assigned_on varchar(10) not null;

alter table homework_tasks add column if not exists due_on varchar(10) not null;

alter table homework_tasks add column if not exists submission_type varchar(16) not null;

alter table homework_tasks add column if not exists class_id varchar(64) not null;

alter table homework_tasks add column if not exists school_id varchar(64) not null;

alter table homework_tasks add column if not exists subject varchar(64) not null;

alter table homework_tasks add column if not exists teacher_staff_id varchar(64) not null;

alter table homework_tasks add column if not exists id varchar(96) not null;

alter table homework_tasks add column if not exists teacher_name varchar(128) not null;

alter table homework_tasks add column if not exists title varchar(200) not null;

alter table homework_tasks add column if not exists instructions varchar(1000) not null;

alter table homework_tasks add column if not exists status_json varchar(20000) not null;

create table if not exists library_books (
        available_copies integer not null,
        total_copies integer not null,
        shelf_location varchar(32),
        category varchar(64),
        id varchar(64) not null,
        isbn varchar(64),
        school_id varchar(64) not null,
        author varchar(128) not null,
        title varchar(255) not null,
        primary key (id)
    );

alter table library_books add column if not exists available_copies integer not null;

alter table library_books add column if not exists total_copies integer not null;

alter table library_books add column if not exists shelf_location varchar(32);

alter table library_books add column if not exists category varchar(64);

alter table library_books add column if not exists id varchar(64) not null;

alter table library_books add column if not exists isbn varchar(64);

alter table library_books add column if not exists school_id varchar(64) not null;

alter table library_books add column if not exists author varchar(128) not null;

alter table library_books add column if not exists title varchar(255) not null;

create table if not exists login_sessions (
        revoked boolean not null,
        expires_at bigint not null,
        issued_at bigint not null,
        account_id varchar(64) not null,
        id varchar(64) not null,
        membership_id varchar(64) not null,
        school_id varchar(64) not null,
        student_id varchar(64),
        methods varchar(128) not null,
        contact varchar(200),
        primary key (id)
    );

alter table login_sessions add column if not exists revoked boolean not null;

alter table login_sessions add column if not exists expires_at bigint not null;

alter table login_sessions add column if not exists issued_at bigint not null;

alter table login_sessions add column if not exists account_id varchar(64) not null;

alter table login_sessions add column if not exists id varchar(64) not null;

alter table login_sessions add column if not exists membership_id varchar(64) not null;

alter table login_sessions add column if not exists school_id varchar(64) not null;

alter table login_sessions add column if not exists student_id varchar(64);

alter table login_sessions add column if not exists methods varchar(128) not null;

alter table login_sessions add column if not exists contact varchar(200);

create table if not exists mark_corrections (
        from_value varchar(8) not null,
        to_value varchar(8) not null,
        field varchar(16) not null,
        status varchar(16) not null,
        exam_name varchar(32) not null,
        class_id varchar(64) not null,
        raised_by varchar(64) not null,
        school_id varchar(64) not null,
        student_id varchar(64) not null,
        subject varchar(64) not null,
        id varchar(96) not null,
        result_id varchar(200) not null,
        reason varchar(500) not null,
        log_json varchar(20000) not null,
        primary key (id)
    );

alter table mark_corrections add column if not exists from_value varchar(8) not null;

alter table mark_corrections add column if not exists to_value varchar(8) not null;

alter table mark_corrections add column if not exists field varchar(16) not null;

alter table mark_corrections add column if not exists status varchar(16) not null;

alter table mark_corrections add column if not exists exam_name varchar(32) not null;

alter table mark_corrections add column if not exists class_id varchar(64) not null;

alter table mark_corrections add column if not exists raised_by varchar(64) not null;

alter table mark_corrections add column if not exists school_id varchar(64) not null;

alter table mark_corrections add column if not exists student_id varchar(64) not null;

alter table mark_corrections add column if not exists subject varchar(64) not null;

alter table mark_corrections add column if not exists id varchar(96) not null;

alter table mark_corrections add column if not exists result_id varchar(200) not null;

alter table mark_corrections add column if not exists reason varchar(500) not null;

alter table mark_corrections add column if not exists log_json varchar(20000) not null;

create table if not exists marks_records (
        maximum_marks float(53) not null,
        percentage float(53),
        score float(53) not null,
        created_at timestamp(6),
        grade varchar(8),
        updated_at timestamp(6),
        status varchar(32) not null,
        class_id varchar(64) not null,
        entered_by_teacher_id varchar(64),
        exam varchar(64) not null,
        id varchar(64) not null,
        school_id varchar(64) not null,
        student_id varchar(64) not null,
        subject varchar(64) not null,
        verified_by_user_id varchar(64),
        student_name varchar(128) not null,
        remarks varchar(255),
        primary key (id)
    );

alter table marks_records add column if not exists maximum_marks float(53) not null;

alter table marks_records add column if not exists percentage float(53);

alter table marks_records add column if not exists score float(53) not null;

alter table marks_records add column if not exists created_at timestamp(6);

alter table marks_records add column if not exists grade varchar(8);

alter table marks_records add column if not exists updated_at timestamp(6);

alter table marks_records add column if not exists status varchar(32) not null;

alter table marks_records add column if not exists class_id varchar(64) not null;

alter table marks_records add column if not exists entered_by_teacher_id varchar(64);

alter table marks_records add column if not exists exam varchar(64) not null;

alter table marks_records add column if not exists id varchar(64) not null;

alter table marks_records add column if not exists school_id varchar(64) not null;

alter table marks_records add column if not exists student_id varchar(64) not null;

alter table marks_records add column if not exists subject varchar(64) not null;

alter table marks_records add column if not exists verified_by_user_id varchar(64);

alter table marks_records add column if not exists student_name varchar(128) not null;

alter table marks_records add column if not exists remarks varchar(255);

create table if not exists marks_sheets (
        status varchar(16) not null,
        assessment_id varchar(64) not null,
        class_id varchar(64) not null,
        school_id varchar(64) not null,
        subject varchar(64) not null,
        teacher_staff_id varchar(64) not null,
        id varchar(200) not null,
        return_reason varchar(500),
        log_json varchar(20000) not null,
        rows_json varchar(20000) not null,
        primary key (id)
    );

alter table marks_sheets add column if not exists status varchar(16) not null;

alter table marks_sheets add column if not exists assessment_id varchar(64) not null;

alter table marks_sheets add column if not exists class_id varchar(64) not null;

alter table marks_sheets add column if not exists school_id varchar(64) not null;

alter table marks_sheets add column if not exists subject varchar(64) not null;

alter table marks_sheets add column if not exists teacher_staff_id varchar(64) not null;

alter table marks_sheets add column if not exists id varchar(200) not null;

alter table marks_sheets add column if not exists return_reason varchar(500);

alter table marks_sheets add column if not exists log_json varchar(20000) not null;

alter table marks_sheets add column if not exists rows_json varchar(20000) not null;

create table if not exists message_threads (
        category varchar(32) not null,
        last_at varchar(40) not null,
        school_id varchar(64) not null,
        student_id varchar(64) not null,
        teacher_staff_id varchar(64) not null,
        id varchar(96) not null,
        teacher_name varchar(128) not null,
        subject varchar(200) not null,
        teacher_role varchar(200) not null,
        messages_json varchar(20000) not null,
        primary key (id)
    );

alter table message_threads add column if not exists category varchar(32) not null;

alter table message_threads add column if not exists last_at varchar(40) not null;

alter table message_threads add column if not exists school_id varchar(64) not null;

alter table message_threads add column if not exists student_id varchar(64) not null;

alter table message_threads add column if not exists teacher_staff_id varchar(64) not null;

alter table message_threads add column if not exists id varchar(96) not null;

alter table message_threads add column if not exists teacher_name varchar(128) not null;

alter table message_threads add column if not exists subject varchar(200) not null;

alter table message_threads add column if not exists teacher_role varchar(200) not null;

alter table message_threads add column if not exists messages_json varchar(20000) not null;

create table if not exists otp_challenges (
        attempts_left integer not null,
        consumed boolean not null,
        resends integer not null,
        channel varchar(8) not null,
        created_at bigint not null,
        expires_at bigint not null,
        last_sent_at bigint not null,
        purpose varchar(40) not null,
        bound_to varchar(64),
        id varchar(64) not null,
        code_hash varchar(128) not null,
        destination varchar(160) not null,
        primary key (id)
    );

alter table otp_challenges add column if not exists attempts_left integer not null;

alter table otp_challenges add column if not exists consumed boolean not null;

alter table otp_challenges add column if not exists resends integer not null;

alter table otp_challenges add column if not exists channel varchar(8) not null;

alter table otp_challenges add column if not exists created_at bigint not null;

alter table otp_challenges add column if not exists expires_at bigint not null;

alter table otp_challenges add column if not exists last_sent_at bigint not null;

alter table otp_challenges add column if not exists purpose varchar(40) not null;

alter table otp_challenges add column if not exists bound_to varchar(64);

alter table otp_challenges add column if not exists id varchar(64) not null;

alter table otp_challenges add column if not exists code_hash varchar(128) not null;

alter table otp_challenges add column if not exists destination varchar(160) not null;

create table if not exists parent_linked_students (
        user_account_id varchar(64) not null,
        linked_student_id varchar(255)
    );

alter table parent_linked_students add column if not exists user_account_id varchar(64) not null;

alter table parent_linked_students add column if not exists linked_student_id varchar(255);

create table if not exists parent_meetings (
        status varchar(24) not null,
        meeting_at varchar(40) not null,
        school_id varchar(64) not null,
        student_id varchar(64) not null,
        id varchar(96) not null,
        teacher_name varchar(128) not null,
        purpose varchar(300) not null,
        parent_summary varchar(1000),
        primary key (id)
    );

alter table parent_meetings add column if not exists status varchar(24) not null;

alter table parent_meetings add column if not exists meeting_at varchar(40) not null;

alter table parent_meetings add column if not exists school_id varchar(64) not null;

alter table parent_meetings add column if not exists student_id varchar(64) not null;

alter table parent_meetings add column if not exists id varchar(96) not null;

alter table parent_meetings add column if not exists teacher_name varchar(128) not null;

alter table parent_meetings add column if not exists purpose varchar(300) not null;

alter table parent_meetings add column if not exists parent_summary varchar(1000);

create table if not exists parent_teacher_meetings (
        meeting_date date not null,
        created_at timestamp(6),
        meeting_time varchar(16) not null,
        mode varchar(32),
        status varchar(32),
        id varchar(64) not null,
        parent_id varchar(64) not null,
        school_id varchar(64) not null,
        student_id varchar(64),
        teacher_id varchar(64) not null,
        parent_name varchar(128),
        student_name varchar(128),
        teacher_name varchar(128),
        agenda TEXT,
        meeting_link varchar(255),
        notes TEXT,
        title varchar(255) not null,
        primary key (id)
    );

alter table parent_teacher_meetings add column if not exists meeting_date date not null;

alter table parent_teacher_meetings add column if not exists created_at timestamp(6);

alter table parent_teacher_meetings add column if not exists meeting_time varchar(16) not null;

alter table parent_teacher_meetings add column if not exists mode varchar(32);

alter table parent_teacher_meetings add column if not exists status varchar(32);

alter table parent_teacher_meetings add column if not exists id varchar(64) not null;

alter table parent_teacher_meetings add column if not exists parent_id varchar(64) not null;

alter table parent_teacher_meetings add column if not exists school_id varchar(64) not null;

alter table parent_teacher_meetings add column if not exists student_id varchar(64);

alter table parent_teacher_meetings add column if not exists teacher_id varchar(64) not null;

alter table parent_teacher_meetings add column if not exists parent_name varchar(128);

alter table parent_teacher_meetings add column if not exists student_name varchar(128);

alter table parent_teacher_meetings add column if not exists teacher_name varchar(128);

alter table parent_teacher_meetings add column if not exists agenda TEXT;

alter table parent_teacher_meetings add column if not exists meeting_link varchar(255);

alter table parent_teacher_meetings add column if not exists notes TEXT;

alter table parent_teacher_meetings add column if not exists title varchar(255) not null;

create table if not exists parents (
        created_at timestamp(6),
        mobile varchar(32),
        id varchar(64) not null,
        login_id varchar(64) not null,
        school_id varchar(64) not null,
        email varchar(128),
        name varchar(128) not null,
        occupation varchar(128),
        address varchar(255),
        primary key (id),
        constraint uk_parent_school_login unique (school_id, login_id)
    );

alter table parents add column if not exists created_at timestamp(6);

alter table parents add column if not exists mobile varchar(32);

alter table parents add column if not exists id varchar(64) not null;

alter table parents add column if not exists login_id varchar(64) not null;

alter table parents add column if not exists school_id varchar(64) not null;

alter table parents add column if not exists email varchar(128);

alter table parents add column if not exists name varchar(128) not null;

alter table parents add column if not exists occupation varchar(128);

alter table parents add column if not exists address varchar(255);

create table if not exists pickup_passes (
        valid_until bigint not null,
        mobile varchar(16) not null,
        status varchar(16) not null,
        issued_at varchar(40) not null,
        used_at varchar(40),
        issued_by_guardian_id varchar(64) not null,
        relation varchar(64) not null,
        school_id varchar(64) not null,
        student_id varchar(64) not null,
        used_by varchar(64),
        id varchar(96) not null,
        code_hash varchar(128) not null,
        person_name varchar(128) not null,
        reason varchar(300) not null,
        primary key (id)
    );

alter table pickup_passes add column if not exists valid_until bigint not null;

alter table pickup_passes add column if not exists mobile varchar(16) not null;

alter table pickup_passes add column if not exists status varchar(16) not null;

alter table pickup_passes add column if not exists issued_at varchar(40) not null;

alter table pickup_passes add column if not exists used_at varchar(40);

alter table pickup_passes add column if not exists issued_by_guardian_id varchar(64) not null;

alter table pickup_passes add column if not exists relation varchar(64) not null;

alter table pickup_passes add column if not exists school_id varchar(64) not null;

alter table pickup_passes add column if not exists student_id varchar(64) not null;

alter table pickup_passes add column if not exists used_by varchar(64);

alter table pickup_passes add column if not exists id varchar(96) not null;

alter table pickup_passes add column if not exists code_hash varchar(128) not null;

alter table pickup_passes add column if not exists person_name varchar(128) not null;

alter table pickup_passes add column if not exists reason varchar(300) not null;

create table if not exists published_results (
        version integer not null,
        published_on varchar(10) not null,
        status varchar(16) not null,
        exam_name varchar(32) not null,
        school_id varchar(64) not null,
        student_id varchar(64) not null,
        id varchar(96) not null,
        class_teacher_remark varchar(500),
        subjects_json varchar(4000) not null,
        primary key (id)
    );

alter table published_results add column if not exists version integer not null;

alter table published_results add column if not exists published_on varchar(10) not null;

alter table published_results add column if not exists status varchar(16) not null;

alter table published_results add column if not exists exam_name varchar(32) not null;

alter table published_results add column if not exists school_id varchar(64) not null;

alter table published_results add column if not exists student_id varchar(64) not null;

alter table published_results add column if not exists id varchar(96) not null;

alter table published_results add column if not exists class_teacher_remark varchar(500);

alter table published_results add column if not exists subjects_json varchar(4000) not null;

create table if not exists quizzes (
        active boolean not null,
        duration_minutes integer not null,
        total_marks integer not null,
        created_at timestamp(6),
        class_id varchar(64) not null,
        id varchar(64) not null,
        school_id varchar(64) not null,
        subject varchar(64) not null,
        created_by varchar(128),
        questions_data TEXT,
        title varchar(255) not null,
        primary key (id)
    );

alter table quizzes add column if not exists active boolean not null;

alter table quizzes add column if not exists duration_minutes integer not null;

alter table quizzes add column if not exists total_marks integer not null;

alter table quizzes add column if not exists created_at timestamp(6);

alter table quizzes add column if not exists class_id varchar(64) not null;

alter table quizzes add column if not exists id varchar(64) not null;

alter table quizzes add column if not exists school_id varchar(64) not null;

alter table quizzes add column if not exists subject varchar(64) not null;

alter table quizzes add column if not exists created_by varchar(128);

alter table quizzes add column if not exists questions_data TEXT;

alter table quizzes add column if not exists title varchar(255) not null;

create table if not exists report_cards (
        status varchar(16) not null,
        assessment_id varchar(64) not null,
        class_id varchar(64) not null,
        school_id varchar(64) not null,
        student_id varchar(64) not null,
        id varchar(200) not null,
        class_teacher_remark varchar(300) not null,
        principal_note varchar(500),
        log_json varchar(20000) not null,
        subjects_json varchar(20000) not null,
        primary key (id)
    );

alter table report_cards add column if not exists status varchar(16) not null;

alter table report_cards add column if not exists assessment_id varchar(64) not null;

alter table report_cards add column if not exists class_id varchar(64) not null;

alter table report_cards add column if not exists school_id varchar(64) not null;

alter table report_cards add column if not exists student_id varchar(64) not null;

alter table report_cards add column if not exists id varchar(200) not null;

alter table report_cards add column if not exists class_teacher_remark varchar(300) not null;

alter table report_cards add column if not exists principal_note varchar(500);

alter table report_cards add column if not exists log_json varchar(20000) not null;

alter table report_cards add column if not exists subjects_json varchar(20000) not null;

create table if not exists school_classes (
        active boolean not null,
        grade_number integer,
        section varchar(16) not null,
        school_level varchar(32),
        class_teacher_id varchar(64),
        id varchar(64) not null,
        name varchar(64) not null,
        school_id varchar(64) not null,
        class_teacher_name varchar(128),
        primary key (id),
        constraint uk_class_school_section unique (school_id, name, section)
    );

alter table school_classes add column if not exists active boolean not null;

alter table school_classes add column if not exists grade_number integer;

alter table school_classes add column if not exists section varchar(16) not null;

alter table school_classes add column if not exists school_level varchar(32);

alter table school_classes add column if not exists class_teacher_id varchar(64);

alter table school_classes add column if not exists id varchar(64) not null;

alter table school_classes add column if not exists name varchar(64) not null;

alter table school_classes add column if not exists school_id varchar(64) not null;

alter table school_classes add column if not exists class_teacher_name varchar(128);

create table if not exists school_memberships (
        active boolean not null,
        created_at timestamp(6),
        role varchar(32) not null check (role in ('ADMIN','PRINCIPAL','TEACHER','PARENT','STUDENT')),
        account_id varchar(64) not null,
        id varchar(64) not null,
        school_id varchar(64) not null,
        title varchar(128),
        permissions varchar(255),
        primary key (id),
        constraint uk_membership_account_school_role unique (account_id, school_id, role)
    );

alter table school_memberships add column if not exists active boolean not null;

alter table school_memberships add column if not exists created_at timestamp(6);

alter table school_memberships add column if not exists role varchar(32) not null check (role in ('ADMIN','PRINCIPAL','TEACHER','PARENT','STUDENT'));

alter table school_memberships add column if not exists account_id varchar(64) not null;

alter table school_memberships add column if not exists id varchar(64) not null;

alter table school_memberships add column if not exists school_id varchar(64) not null;

alter table school_memberships add column if not exists title varchar(128);

alter table school_memberships add column if not exists permissions varchar(255);

create table if not exists school_notices (
        active boolean not null,
        published_date date not null,
        created_at timestamp(6),
        priority varchar(16),
        audience varchar(32) not null,
        category varchar(32) not null,
        id varchar(64) not null,
        school_id varchar(64) not null,
        author_name varchar(128),
        content TEXT not null,
        title varchar(255) not null,
        primary key (id)
    );

alter table school_notices add column if not exists active boolean not null;

alter table school_notices add column if not exists published_date date not null;

alter table school_notices add column if not exists created_at timestamp(6);

alter table school_notices add column if not exists priority varchar(16);

alter table school_notices add column if not exists audience varchar(32) not null;

alter table school_notices add column if not exists category varchar(32) not null;

alter table school_notices add column if not exists id varchar(64) not null;

alter table school_notices add column if not exists school_id varchar(64) not null;

alter table school_notices add column if not exists author_name varchar(128);

alter table school_notices add column if not exists content TEXT not null;

alter table school_notices add column if not exists title varchar(255) not null;

create table if not exists school_settings (
        current_academic_year varchar(32),
        phone varchar(32),
        school_code varchar(32),
        affiliation_number varchar(64),
        id varchar(64) not null,
        school_id varchar(64) not null,
        email varchar(128),
        school_name varchar(128) not null,
        website varchar(128),
        address varchar(255),
        primary key (id)
    );

alter table school_settings add column if not exists current_academic_year varchar(32);

alter table school_settings add column if not exists phone varchar(32);

alter table school_settings add column if not exists school_code varchar(32);

alter table school_settings add column if not exists affiliation_number varchar(64);

alter table school_settings add column if not exists id varchar(64) not null;

alter table school_settings add column if not exists school_id varchar(64) not null;

alter table school_settings add column if not exists email varchar(128);

alter table school_settings add column if not exists school_name varchar(128) not null;

alter table school_settings add column if not exists website varchar(128);

alter table school_settings add column if not exists address varchar(255);

create table if not exists schools (
        created_at timestamp(6),
        status varchar(32) not null,
        board varchar(64) not null,
        id varchar(64) not null,
        name varchar(200) not null,
        late_fee_policy varchar(300),
        primary key (id)
    );

alter table schools add column if not exists created_at timestamp(6);

alter table schools add column if not exists status varchar(32) not null;

alter table schools add column if not exists board varchar(64) not null;

alter table schools add column if not exists id varchar(64) not null;

alter table schools add column if not exists name varchar(200) not null;

alter table schools add column if not exists late_fee_policy varchar(300);

create table if not exists staff_attendance_records (
        attendance_date date not null,
        created_at timestamp(6),
        check_in_time varchar(16),
        check_out_time varchar(16),
        status varchar(32) not null,
        designation varchar(64),
        id varchar(64) not null,
        school_id varchar(64) not null,
        teacher_id varchar(64) not null,
        teacher_name varchar(128) not null,
        remarks varchar(255),
        primary key (id)
    );

alter table staff_attendance_records add column if not exists attendance_date date not null;

alter table staff_attendance_records add column if not exists created_at timestamp(6);

alter table staff_attendance_records add column if not exists status varchar(32) not null;

alter table staff_attendance_records add column if not exists designation varchar(64);

alter table staff_attendance_records add column if not exists id varchar(64) not null;

alter table staff_attendance_records add column if not exists school_id varchar(64) not null;

alter table staff_attendance_records add column if not exists teacher_id varchar(64) not null;

alter table staff_attendance_records add column if not exists teacher_name varchar(128) not null;

alter table staff_attendance_records add column if not exists remarks varchar(255);

create table if not exists staff_invitations (
        expires_at bigint not null,
        used_at bigint,
        role varchar(16) not null,
        account_id varchar(64) not null,
        invited_by varchar(64) not null,
        membership_id varchar(64) not null,
        school_id varchar(64) not null,
        token varchar(64) not null,
        email varchar(160) not null,
        primary key (token)
    );

alter table staff_invitations add column if not exists expires_at bigint not null;

alter table staff_invitations add column if not exists used_at bigint;

alter table staff_invitations add column if not exists role varchar(16) not null;

alter table staff_invitations add column if not exists account_id varchar(64) not null;

alter table staff_invitations add column if not exists invited_by varchar(64) not null;

alter table staff_invitations add column if not exists membership_id varchar(64) not null;

alter table staff_invitations add column if not exists school_id varchar(64) not null;

alter table staff_invitations add column if not exists token varchar(64) not null;

alter table staff_invitations add column if not exists email varchar(160) not null;

create table if not exists student_attendance_days (
        afternoon varchar(1) not null,
        morning varchar(1) not null,
        attendance_date varchar(10) not null,
        school_id varchar(64) not null,
        student_id varchar(64) not null,
        id varchar(96) not null,
        primary key (id),
        constraint uk_att_day_school_student_date unique (school_id, student_id, attendance_date)
    );

alter table student_attendance_days add column if not exists afternoon varchar(1) not null;

alter table student_attendance_days add column if not exists morning varchar(1) not null;

alter table student_attendance_days add column if not exists attendance_date varchar(10) not null;

alter table student_attendance_days add column if not exists school_id varchar(64) not null;

alter table student_attendance_days add column if not exists student_id varchar(64) not null;

alter table student_attendance_days add column if not exists id varchar(96) not null;

create table if not exists student_leave_requests (
        from_date varchar(10) not null,
        to_date varchar(10) not null,
        status varchar(16) not null,
        kind varchar(32) not null,
        decided_at varchar(40),
        requested_at varchar(40) not null,
        class_id varchar(64) not null,
        decided_by varchar(64),
        requested_by_guardian_id varchar(64) not null,
        school_id varchar(64) not null,
        student_id varchar(64) not null,
        id varchar(96) not null,
        decided_by_name varchar(128),
        decision_note varchar(300),
        reason varchar(500) not null,
        primary key (id)
    );

alter table student_leave_requests add column if not exists from_date varchar(10) not null;

alter table student_leave_requests add column if not exists to_date varchar(10) not null;

alter table student_leave_requests add column if not exists status varchar(16) not null;

alter table student_leave_requests add column if not exists kind varchar(32) not null;

alter table student_leave_requests add column if not exists decided_at varchar(40);

alter table student_leave_requests add column if not exists requested_at varchar(40) not null;

alter table student_leave_requests add column if not exists class_id varchar(64) not null;

alter table student_leave_requests add column if not exists decided_by varchar(64);

alter table student_leave_requests add column if not exists requested_by_guardian_id varchar(64) not null;

alter table student_leave_requests add column if not exists school_id varchar(64) not null;

alter table student_leave_requests add column if not exists student_id varchar(64) not null;

alter table student_leave_requests add column if not exists id varchar(96) not null;

alter table student_leave_requests add column if not exists decided_by_name varchar(128);

alter table student_leave_requests add column if not exists decision_note varchar(300);

alter table student_leave_requests add column if not exists reason varchar(500) not null;

create table if not exists students (
        fee_balance float(53),
        hall_ticket_approved boolean,
        hall_ticket_released boolean,
        created_at timestamp(6),
        updated_at timestamp(6),
        blood_group varchar(16),
        gender varchar(16),
        pincode varchar(16),
        roll varchar(16) not null,
        section varchar(16) not null,
        aadhaar_number varchar(20),
        father_aadhaar varchar(20),
        mother_aadhaar varchar(20),
        apaar_id varchar(32),
        caste_category varchar(32),
        dob varchar(32),
        exit_date varchar(32),
        father_mobile varchar(32),
        medium_of_instruction varchar(32),
        mother_mobile varchar(32),
        mother_tongue varchar(32),
        parent_mobile varchar(32),
        religion varchar(32),
        second_language varchar(32),
        status varchar(32) not null,
        admission_number varchar(64) not null,
        class_id varchar(64) not null,
        class_name varchar(64) not null,
        district varchar(64),
        id varchar(64) not null,
        mandal varchar(64),
        parent_account_id varchar(64),
        school_id varchar(64) not null,
        sub_caste varchar(64),
        tc_number varchar(64),
        transport_route_id varchar(64),
        father_name varchar(128),
        father_occupation varchar(128),
        mother_name varchar(128),
        mother_occupation varchar(128),
        name varchar(128) not null,
        parent_email varchar(128),
        parent_name varchar(128),
        transport_stop varchar(128),
        address varchar(255),
        destination_school varchar(255),
        exit_reason varchar(255),
        previous_school varchar(255),
        primary key (id),
        constraint uk_student_school_adm unique (school_id, admission_number)
    );

alter table students add column if not exists fee_balance float(53);

alter table students add column if not exists hall_ticket_approved boolean;

alter table students add column if not exists hall_ticket_released boolean;

alter table students add column if not exists created_at timestamp(6);

alter table students add column if not exists updated_at timestamp(6);

alter table students add column if not exists blood_group varchar(16);

alter table students add column if not exists gender varchar(16);

alter table students add column if not exists pincode varchar(16);

alter table students add column if not exists roll varchar(16) not null;

alter table students add column if not exists section varchar(16) not null;

alter table students add column if not exists aadhaar_number varchar(20);

alter table students add column if not exists father_aadhaar varchar(20);

alter table students add column if not exists mother_aadhaar varchar(20);

alter table students add column if not exists apaar_id varchar(32);

alter table students add column if not exists caste_category varchar(32);

alter table students add column if not exists dob varchar(32);

alter table students add column if not exists exit_date varchar(32);

alter table students add column if not exists father_mobile varchar(32);

alter table students add column if not exists medium_of_instruction varchar(32);

alter table students add column if not exists mother_mobile varchar(32);

alter table students add column if not exists mother_tongue varchar(32);

alter table students add column if not exists parent_mobile varchar(32);

alter table students add column if not exists religion varchar(32);

alter table students add column if not exists second_language varchar(32);

alter table students add column if not exists status varchar(32) not null;

alter table students add column if not exists admission_number varchar(64) not null;

alter table students add column if not exists class_id varchar(64) not null;

alter table students add column if not exists class_name varchar(64) not null;

alter table students add column if not exists district varchar(64);

alter table students add column if not exists id varchar(64) not null;

alter table students add column if not exists mandal varchar(64);

alter table students add column if not exists parent_account_id varchar(64);

alter table students add column if not exists school_id varchar(64) not null;

alter table students add column if not exists sub_caste varchar(64);

alter table students add column if not exists tc_number varchar(64);

alter table students add column if not exists transport_route_id varchar(64);

alter table students add column if not exists father_name varchar(128);

alter table students add column if not exists father_occupation varchar(128);

alter table students add column if not exists mother_name varchar(128);

alter table students add column if not exists mother_occupation varchar(128);

alter table students add column if not exists name varchar(128) not null;

alter table students add column if not exists parent_email varchar(128);

alter table students add column if not exists parent_name varchar(128);

alter table students add column if not exists transport_stop varchar(128);

alter table students add column if not exists address varchar(255);

alter table students add column if not exists destination_school varchar(255);

alter table students add column if not exists exit_reason varchar(255);

alter table students add column if not exists previous_school varchar(255);

create table if not exists study_materials (
        uploaded_at timestamp(6),
        material_type varchar(32),
        class_id varchar(64) not null,
        id varchar(64) not null,
        school_id varchar(64) not null,
        subject varchar(64) not null,
        uploaded_by varchar(128),
        description TEXT,
        file_url varchar(255),
        title varchar(255) not null,
        primary key (id)
    );

alter table study_materials add column if not exists uploaded_at timestamp(6);

alter table study_materials add column if not exists material_type varchar(32);

alter table study_materials add column if not exists class_id varchar(64) not null;

alter table study_materials add column if not exists id varchar(64) not null;

alter table study_materials add column if not exists school_id varchar(64) not null;

alter table study_materials add column if not exists subject varchar(64) not null;

alter table study_materials add column if not exists uploaded_by varchar(128);

alter table study_materials add column if not exists description TEXT;

alter table study_materials add column if not exists file_url varchar(255);

alter table study_materials add column if not exists title varchar(255) not null;

create table if not exists subject_allocations (
        active boolean not null,
        created_at timestamp(6),
        updated_at timestamp(6),
        academic_year_id varchar(32),
        role varchar(32),
        class_id varchar(64) not null,
        id varchar(64) not null,
        school_id varchar(64) not null,
        subject varchar(64) not null,
        teacher_id varchar(64) not null,
        teacher_name varchar(128),
        primary key (id)
    );

alter table subject_allocations add column if not exists active boolean not null;

alter table subject_allocations add column if not exists created_at timestamp(6);

alter table subject_allocations add column if not exists updated_at timestamp(6);

alter table subject_allocations add column if not exists academic_year_id varchar(32);

alter table subject_allocations add column if not exists role varchar(32);

alter table subject_allocations add column if not exists class_id varchar(64) not null;

alter table subject_allocations add column if not exists id varchar(64) not null;

alter table subject_allocations add column if not exists school_id varchar(64) not null;

alter table subject_allocations add column if not exists subject varchar(64) not null;

alter table subject_allocations add column if not exists teacher_id varchar(64) not null;

alter table subject_allocations add column if not exists teacher_name varchar(128);

create table if not exists teacher_leave_requests (
        from_date varchar(10) not null,
        to_date varchar(10) not null,
        kind varchar(16) not null,
        status varchar(16) not null,
        decided_at varchar(40),
        arranged_by varchar(64),
        decided_by varchar(64),
        school_id varchar(64) not null,
        staff_id varchar(64) not null,
        id varchar(96) not null,
        staff_name varchar(128) not null,
        decision_note varchar(300),
        reason varchar(500) not null,
        substitution_json varchar(20000) not null,
        primary key (id)
    );

alter table teacher_leave_requests add column if not exists from_date varchar(10) not null;

alter table teacher_leave_requests add column if not exists to_date varchar(10) not null;

alter table teacher_leave_requests add column if not exists kind varchar(16) not null;

alter table teacher_leave_requests add column if not exists status varchar(16) not null;

alter table teacher_leave_requests add column if not exists decided_at varchar(40);

alter table teacher_leave_requests add column if not exists arranged_by varchar(64);

alter table teacher_leave_requests add column if not exists decided_by varchar(64);

alter table teacher_leave_requests add column if not exists school_id varchar(64) not null;

alter table teacher_leave_requests add column if not exists staff_id varchar(64) not null;

alter table teacher_leave_requests add column if not exists id varchar(96) not null;

alter table teacher_leave_requests add column if not exists staff_name varchar(128) not null;

alter table teacher_leave_requests add column if not exists decision_note varchar(300);

alter table teacher_leave_requests add column if not exists reason varchar(500) not null;

alter table teacher_leave_requests add column if not exists substitution_json varchar(20000) not null;

create table if not exists teachers (
        active boolean not null,
        created_at timestamp(6),
        phone varchar(32),
        designation varchar(64),
        id varchar(64) not null,
        primary_subject varchar(64),
        school_id varchar(64) not null,
        teacher_id varchar(64) not null,
        email varchar(128),
        name varchar(128) not null,
        qualification varchar(128),
        primary key (id),
        constraint uk_teacher_school_tid unique (school_id, teacher_id)
    );

alter table teachers add column if not exists active boolean not null;

alter table teachers add column if not exists created_at timestamp(6);

alter table teachers add column if not exists phone varchar(32);

alter table teachers add column if not exists designation varchar(64);

alter table teachers add column if not exists id varchar(64) not null;

alter table teachers add column if not exists primary_subject varchar(64);

alter table teachers add column if not exists school_id varchar(64) not null;

alter table teachers add column if not exists teacher_id varchar(64) not null;

alter table teachers add column if not exists email varchar(128);

alter table teachers add column if not exists name varchar(128) not null;

alter table teachers add column if not exists qualification varchar(128);

create table if not exists timetable_slots (
        period_number integer not null,
        day_of_week varchar(16) not null,
        end_time varchar(16) not null,
        start_time varchar(16) not null,
        room_number varchar(32),
        class_id varchar(64) not null,
        id varchar(64) not null,
        school_id varchar(64) not null,
        subject varchar(64) not null,
        teacher_id varchar(64),
        teacher_name varchar(128),
        primary key (id)
    );

alter table timetable_slots add column if not exists period_number integer not null;

alter table timetable_slots add column if not exists day_of_week varchar(16) not null;

alter table timetable_slots add column if not exists end_time varchar(16) not null;

alter table timetable_slots add column if not exists start_time varchar(16) not null;

alter table timetable_slots add column if not exists room_number varchar(32);

alter table timetable_slots add column if not exists class_id varchar(64) not null;

alter table timetable_slots add column if not exists id varchar(64) not null;

alter table timetable_slots add column if not exists school_id varchar(64) not null;

alter table timetable_slots add column if not exists subject varchar(64) not null;

alter table timetable_slots add column if not exists teacher_id varchar(64);

alter table timetable_slots add column if not exists teacher_name varchar(128);

create table if not exists transport_requests (
        kind varchar(8) not null,
        effective_from varchar(10) not null,
        status varchar(16) not null,
        created_at varchar(40) not null,
        decided_at varchar(40),
        decided_by varchar(64),
        from_route_id varchar(64),
        requested_by_guardian_id varchar(64) not null,
        school_id varchar(64) not null,
        student_id varchar(64) not null,
        to_route_id varchar(64),
        id varchar(96) not null,
        stop_name varchar(128),
        decision_note varchar(300),
        reason varchar(300) not null,
        primary key (id)
    );

alter table transport_requests add column if not exists kind varchar(8) not null;

alter table transport_requests add column if not exists effective_from varchar(10) not null;

alter table transport_requests add column if not exists status varchar(16) not null;

alter table transport_requests add column if not exists created_at varchar(40) not null;

alter table transport_requests add column if not exists decided_at varchar(40);

alter table transport_requests add column if not exists decided_by varchar(64);

alter table transport_requests add column if not exists from_route_id varchar(64);

alter table transport_requests add column if not exists requested_by_guardian_id varchar(64) not null;

alter table transport_requests add column if not exists school_id varchar(64) not null;

alter table transport_requests add column if not exists student_id varchar(64) not null;

alter table transport_requests add column if not exists to_route_id varchar(64);

alter table transport_requests add column if not exists id varchar(96) not null;

alter table transport_requests add column if not exists stop_name varchar(128);

alter table transport_requests add column if not exists decision_note varchar(300);

alter table transport_requests add column if not exists reason varchar(300) not null;

create table if not exists transport_routes (
        active boolean not null,
        capacity integer not null,
        enrolled_count integer not null,
        driver_phone varchar(32),
        vehicle_number varchar(32) not null,
        id varchar(64) not null,
        school_id varchar(64) not null,
        driver_name varchar(128),
        route_name varchar(128) not null,
        stops TEXT,
        primary key (id)
    );

alter table transport_routes add column if not exists active boolean not null;

alter table transport_routes add column if not exists capacity integer not null;

alter table transport_routes add column if not exists enrolled_count integer not null;

alter table transport_routes add column if not exists driver_phone varchar(32);

alter table transport_routes add column if not exists vehicle_number varchar(32) not null;

alter table transport_routes add column if not exists id varchar(64) not null;

alter table transport_routes add column if not exists school_id varchar(64) not null;

alter table transport_routes add column if not exists driver_name varchar(128);

alter table transport_routes add column if not exists route_name varchar(128) not null;

alter table transport_routes add column if not exists stops TEXT;

create table if not exists user_accounts (
        active boolean not null,
        created_at timestamp(6),
        updated_at timestamp(6),
        mobile varchar(16),
        role varchar(32) not null check (role in ('ADMIN','PRINCIPAL','TEACHER','PARENT','STUDENT')),
        status varchar(32) not null,
        id varchar(64) not null,
        login_id varchar(64) not null unique,
        student_id varchar(64),
        teacher_id varchar(64),
        email varchar(128),
        name varchar(128) not null,
        password varchar(255) not null,
        primary key (id)
    );

alter table user_accounts add column if not exists active boolean not null;

alter table user_accounts add column if not exists created_at timestamp(6);

alter table user_accounts add column if not exists updated_at timestamp(6);

alter table user_accounts add column if not exists mobile varchar(16);

alter table user_accounts add column if not exists role varchar(32) not null check (role in ('ADMIN','PRINCIPAL','TEACHER','PARENT','STUDENT'));

alter table user_accounts add column if not exists status varchar(32) not null;

alter table user_accounts add column if not exists id varchar(64) not null;

alter table user_accounts add column if not exists login_id varchar(64) not null unique;

alter table user_accounts add column if not exists student_id varchar(64);

alter table user_accounts add column if not exists teacher_id varchar(64);

alter table user_accounts add column if not exists email varchar(128);

alter table user_accounts add column if not exists name varchar(128) not null;

alter table user_accounts add column if not exists password varchar(255) not null;

create index if not exists idx_att_class_date on attendance_records (class_id, attendance_date);

create index if not exists idx_att_student on attendance_records (student_id);

create index if not exists idx_audit_at on audit_events (at);

create index if not exists idx_issue_student on book_issue_records (student_id);

create index if not exists idx_issue_book on book_issue_records (book_id);

create index if not exists idx_cst_class on class_subject_teachers (class_id);

create index if not exists idx_cst_staff on class_subject_teachers (staff_id);

create index if not exists idx_charge_student on fee_charges (student_id);

create index if not exists idx_concession_charge on fee_concessions (charge_id);

create index if not exists idx_payment_student on fee_payments (student_id);

create index if not exists idx_fee_student on fee_transactions (student_id);

create index if not exists idx_hw_class on homework_assignments (class_id);

create index if not exists idx_hw_task_class on homework_tasks (class_id);

create index if not exists idx_session_account on login_sessions (account_id);

create index if not exists idx_correction_class on mark_corrections (class_id);

create index if not exists idx_marks_class_exam on marks_records (class_id, exam, subject);

create index if not exists idx_marks_student on marks_records (student_id);

create index if not exists idx_sheet_class on marks_sheets (assessment_id, class_id);

create index if not exists idx_thread_student on message_threads (student_id);

create index if not exists idx_thread_teacher on message_threads (teacher_staff_id);

create index if not exists idx_otp_destination_created on otp_challenges (destination, created_at);

create index if not exists idx_pickup_code on pickup_passes (code_hash);

create index if not exists idx_result_student on published_results (student_id);

create index if not exists idx_card_class on report_cards (assessment_id, class_id);

create index if not exists idx_membership_account on school_memberships (account_id);

create index if not exists idx_staff_att_date on staff_attendance_records (attendance_date);

create index if not exists idx_staff_att_teacher on staff_attendance_records (teacher_id);

create index if not exists idx_sleave_class on student_leave_requests (class_id);

create index if not exists idx_sleave_student on student_leave_requests (student_id);

create index if not exists idx_student_class_id on students (class_id);

create index if not exists idx_student_parent_account_id on students (parent_account_id);

create index if not exists idx_mat_class_subject on study_materials (class_id, subject);

create index if not exists idx_alloc_class on subject_allocations (class_id);

create index if not exists idx_alloc_teacher on subject_allocations (teacher_id);

create index if not exists idx_tleave_staff on teacher_leave_requests (staff_id);

create index if not exists idx_tt_class_day on timetable_slots (class_id, day_of_week);

create index if not exists idx_tt_teacher_day on timetable_slots (teacher_id, day_of_week);

create index if not exists idx_user_mobile on user_accounts (mobile);

create index if not exists idx_user_email on user_accounts (email);

do $$ begin
    if not exists (select 1 from pg_constraint where conname = 'fk4qdx7g61r4kbwetk7mwvtg87h') then
        alter table if exists fee_payment_allocations add constraint FK4qdx7g61r4kbwetk7mwvtg87h foreign key (payment_id) references fee_payments;
    end if;
end $$;

do $$ begin
    if not exists (select 1 from pg_constraint where conname = 'fkqvovqutd4csrhwgnmnbdef3yw') then
        alter table if exists parent_linked_students add constraint FKqvovqutd4csrhwgnmnbdef3yw foreign key (user_account_id) references user_accounts;
    end if;
end $$;
