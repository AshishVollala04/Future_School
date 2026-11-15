-- A teacher teaches in ONE school.
-- (Parents can still have children in several schools; each child is a separate session.)
--
-- 1. If a teacher has more than one active teacher membership, keep the first one (lowest id)
--    and SUSPEND the others. Nothing is deleted: an Admin can see and reactivate it after the
--    other one is suspended.
-- 2. The database then refuses a second active teacher membership for the same person.

update school_memberships m
   set active = false
 where m.role = 'TEACHER'
   and m.active
   and exists (select 1 from school_memberships o
                where o.account_id = m.account_id
                  and o.role = 'TEACHER'
                  and o.active
                  and o.id < m.id);

create unique index if not exists uk_teacher_one_active_school
    on school_memberships (account_id)
 where role = 'TEACHER' and active;
