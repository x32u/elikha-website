-- Admin / Super Admin class management access for e-Likha.
-- Apply this in Supabase SQL Editor after auth_user_profiles.sql.
--
-- Why this exists:
-- - Teachers should only manage classes assigned to them.
-- - Admins/Super Admins need to see and manage all class sections.
-- - Older activities can reference class IDs whose class rows are missing;
--   those rows are recovered as editable placeholder classes.

create or replace function public.elikha_current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select replace(replace(replace(lower(coalesce(u.role, '')), '_', ''), '-', ''), ' ', '')
  from public.users u
  where u.id = auth.uid()
  limit 1;
$$;

revoke all on function public.elikha_current_role() from public;
grant execute on function public.elikha_current_role() to authenticated;

create or replace function public.elikha_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.elikha_current_role() in ('admin', 'superadmin'), false);
$$;

revoke all on function public.elikha_is_admin() from public;
grant execute on function public.elikha_is_admin() to authenticated;

alter table public.classes enable row level security;

drop policy if exists "Teachers can read assigned classes" on public.classes;
create policy "Teachers can read assigned classes"
on public.classes
for select
to authenticated
using (
  teacher_id = auth.uid()
  or public.elikha_is_admin()
);

drop policy if exists "Teachers can insert assigned classes" on public.classes;
create policy "Teachers can insert assigned classes"
on public.classes
for insert
to authenticated
with check (
  teacher_id = auth.uid()
  or public.elikha_is_admin()
);

drop policy if exists "Teachers can update assigned classes" on public.classes;
create policy "Teachers can update assigned classes"
on public.classes
for update
to authenticated
using (
  teacher_id = auth.uid()
  or public.elikha_is_admin()
)
with check (
  teacher_id = auth.uid()
  or public.elikha_is_admin()
);

drop policy if exists "Teachers can delete assigned empty classes" on public.classes;
create policy "Teachers can delete assigned empty classes"
on public.classes
for delete
to authenticated
using (
  teacher_id = auth.uid()
  or public.elikha_is_admin()
);

alter table public.class_students enable row level security;

drop policy if exists "Class owners can read enrollments" on public.class_students;
create policy "Class owners can read enrollments"
on public.class_students
for select
to authenticated
using (
  public.elikha_is_admin()
  or exists (
    select 1
    from public.classes c
    where c.id = class_students.class_id
      and c.teacher_id = auth.uid()
  )
  or student_id = auth.uid()
);

drop policy if exists "Class owners can insert enrollments" on public.class_students;
create policy "Class owners can insert enrollments"
on public.class_students
for insert
to authenticated
with check (
  public.elikha_is_admin()
  or exists (
    select 1
    from public.classes c
    where c.id = class_students.class_id
      and c.teacher_id = auth.uid()
  )
);

drop policy if exists "Class owners can update enrollments" on public.class_students;
create policy "Class owners can update enrollments"
on public.class_students
for update
to authenticated
using (
  public.elikha_is_admin()
  or exists (
    select 1
    from public.classes c
    where c.id = class_students.class_id
      and c.teacher_id = auth.uid()
  )
)
with check (
  public.elikha_is_admin()
  or exists (
    select 1
    from public.classes c
    where c.id = class_students.class_id
      and c.teacher_id = auth.uid()
  )
);

drop policy if exists "Class owners can delete enrollments" on public.class_students;
create policy "Class owners can delete enrollments"
on public.class_students
for delete
to authenticated
using (
  public.elikha_is_admin()
  or exists (
    select 1
    from public.classes c
    where c.id = class_students.class_id
      and c.teacher_id = auth.uid()
  )
);

-- Keep admin dashboards/counts functional without weakening student access.
drop policy if exists "Admins can read all activities" on public.activities;
create policy "Admins can read all activities"
on public.activities
for select
to authenticated
using (public.elikha_is_admin());

drop policy if exists "Admins can update all activities" on public.activities;
create policy "Admins can update all activities"
on public.activities
for update
to authenticated
using (public.elikha_is_admin())
with check (public.elikha_is_admin());

-- Recover class rows only if activities still reference class IDs that no
-- longer exist. If the rows exist but were hidden by RLS, this inserts nothing.
insert into public.classes (
  id,
  teacher_id,
  name,
  grade,
  section,
  subject,
  color,
  student_count
)
select
  activity_classes.class_id,
  activity_classes.teacher_id,
  'Recovered Class',
  coalesce(activity_classes.grade, 'Unassigned Grade'),
  'Unassigned Section',
  coalesce(activity_classes.subject, 'Unassigned Subject'),
  '#1800AD',
  0
from (
  select
    a.class_id,
    (array_agg(a.teacher_id) filter (where a.teacher_id is not null))[1] as teacher_id,
    max(nullif(trim(coalesce(a.grade, '')), '')) as grade,
    max(nullif(trim(coalesce(a.subject, '')), '')) as subject
  from public.activities a
  where a.class_id is not null
  group by a.class_id
) activity_classes
left join public.classes c
  on c.id = activity_classes.class_id
where c.id is null
  and activity_classes.teacher_id is not null;

update public.classes c
set student_count = enrollment_counts.student_count
from (
  select
    cs.class_id,
    count(*)::integer as student_count
  from public.class_students cs
  group by cs.class_id
) enrollment_counts
where c.id = enrollment_counts.class_id;
