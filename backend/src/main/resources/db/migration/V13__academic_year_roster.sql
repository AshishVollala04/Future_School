-- Academic-year roster: per-year class assignments (history is never rewritten) and
-- academic-year ownership of fee schedules and fee charges.

-- 1. One row per student per academic year: class, section, roll and how the year ended.
create table if not exists student_enrollments (
    id varchar(160) not null,
    school_id varchar(64) not null,
    student_id varchar(64) not null,
    academic_year_id varchar(64) not null,
    class_id varchar(64) not null,
    class_name varchar(64) not null,
    section varchar(16) not null,
    roll varchar(16) not null,
    outcome varchar(16) not null,
    source varchar(16) not null,
    exit_date varchar(10),
    exit_reason varchar(255),
    created_at varchar(40) not null,
    created_by varchar(64),
    primary key (id)
);
create unique index if not exists uk_enrollment_student_year on student_enrollments (school_id, student_id, academic_year_id);
create index if not exists idx_enrollment_year_class on student_enrollments (school_id, academic_year_id, class_id);

-- 2. Fee schedules and charges belong to an academic year.
alter table fee_instalments add column if not exists academic_year_id varchar(64);
alter table fee_charges add column if not exists academic_year_id varchar(64);
create index if not exists idx_instalment_year on fee_instalments (school_id, academic_year_id, number);
create index if not exists idx_charge_student_year on fee_charges (school_id, student_id, academic_year_id);

-- 3. Existing rows belong to the school's current academic year, where one is recorded.
--    (Schools without an academic_years row are stamped by the app the first time the year is set up.)
update fee_instalments fi set academic_year_id = ay.id
from academic_years ay
where fi.academic_year_id is null and ay.school_id = fi.school_id and ay.is_current = true;

update fee_charges fc set academic_year_id = ay.id
from academic_years ay
where fc.academic_year_id is null and ay.school_id = fc.school_id and ay.is_current = true;
