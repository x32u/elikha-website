-- Close legacy authorization gaps before the web release. All browser access
-- remains subject to authenticated, role-aware RLS; privileged roles can no
-- longer be supplied through public signup metadata or changed by learners.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.elikha_student_has_activity(p_activity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.activity_assignments assignment
    where assignment.activity_id = p_activity_id
      and assignment.student_id = auth.uid()
  );
$$;

revoke all on function private.elikha_student_has_activity(uuid)
  from public, anon, authenticated;
grant execute on function private.elikha_student_has_activity(uuid)
  to authenticated;

create or replace function private.elikha_due_instant(
  p_due_date timestamp without time zone
)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select case
    when p_due_date is null then null
    when p_due_date::time = time '00:00:00'
      then ((p_due_date::date + time '23:59:59.999999') at time zone 'Asia/Manila')
    else p_due_date at time zone 'UTC'
  end;
$$;

-- Public Auth signups are always learners. Privileged accounts must be
-- promoted by an existing platform administrator after the profile exists.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, name, role)
  values (
    new.id,
    lower(new.email),
    coalesce(
      nullif(trim(coalesce(new.raw_user_meta_data->>'name', '')), ''),
      split_part(new.email, '@', 1),
      'User'
    ),
    'student'
  )
  on conflict (id) do update
    set email = excluded.email,
        name = coalesce(nullif(public.users.name, ''), excluded.name);

  return new;
end;
$$;

create or replace function public.sync_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, name, role)
  values (
    new.id,
    lower(new.email),
    coalesce(
      nullif(trim(coalesce(new.raw_user_meta_data->>'name', '')), ''),
      split_part(new.email, '@', 1),
      'User'
    ),
    'student'
  )
  on conflict (id) do update
    set email = excluded.email,
        name = coalesce(nullif(public.users.name, ''), excluded.name);

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.sync_auth_user_profile() from public, anon, authenticated;

-- Prevent direct self-service profile UPDATEs from changing role, id, or
-- account email. Administrators keep their existing platform-management path.
drop policy if exists "Users can update own data" on public.users;
revoke all on table public.users from anon;
grant select, insert, update on table public.users to authenticated;

create or replace function private.elikha_guard_user_sensitive_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_role text := coalesce(public.elikha_current_role(), '');
begin
  if auth.uid() is not null and (
    new.id is distinct from old.id
  ) then
    raise exception using
      errcode = '42501',
      message = 'Account identifiers cannot be changed from the profile table.';
  end if;

  if auth.uid() is not null
     and new.email is distinct from old.email
     and actor_role <> 'superadmin' then
    raise exception using
      errcode = '42501',
      message = 'Only a super administrator can synchronize account email changes.';
  end if;

  if auth.uid() = old.id and new.role is distinct from old.role then
    raise exception using
      errcode = '42501',
      message = 'Users cannot change their own role.';
  end if;

  if actor_role = 'admin' and (
    lower(coalesce(old.role, '')) = 'superadmin'
    or lower(coalesce(new.role, '')) = 'superadmin'
  ) then
    raise exception using
      errcode = '42501',
      message = 'Only a super administrator can manage super administrator accounts.';
  end if;

  return new;
end;
$$;

revoke all on function private.elikha_guard_user_sensitive_fields()
  from public, anon, authenticated;

drop trigger if exists users_guard_sensitive_fields on public.users;
create trigger users_guard_sensitive_fields
before update on public.users
for each row execute function private.elikha_guard_user_sensitive_fields();

-- Class ownership is also a role boundary. Legacy policies compared only the
-- UUID, which let any authenticated account create a class owned by itself and
-- then inherit teacher-like access through downstream ownership checks.
drop policy if exists "Teachers can manage own classes" on public.classes;
drop policy if exists "Teachers can insert assigned classes" on public.classes;
drop policy if exists "Teachers can read assigned classes" on public.classes;
drop policy if exists "Teachers can update assigned classes" on public.classes;

create policy "Teachers can read own classes"
on public.classes for select to authenticated
using (
  teacher_id = (select auth.uid())
  and public.elikha_current_role() = 'teacher'
);

create policy "Teachers can insert own classes"
on public.classes for insert to authenticated
with check (
  teacher_id = (select auth.uid())
  and public.elikha_current_role() = 'teacher'
);

create policy "Teachers can update own classes"
on public.classes for update to authenticated
using (
  teacher_id = (select auth.uid())
  and public.elikha_current_role() = 'teacher'
)
with check (
  teacher_id = (select auth.uid())
  and public.elikha_current_role() = 'teacher'
);

create policy "Admins can manage classes"
on public.classes for all to authenticated
using (public.elikha_is_admin())
with check (public.elikha_is_admin());

revoke all on table public.classes from anon;
grant select, insert, update, delete on table public.classes to authenticated;

drop policy if exists "Teachers can add students to classes" on public.class_students;
drop policy if exists "Teachers can view class students" on public.class_students;
drop policy if exists "Class owners can insert enrollments" on public.class_students;
drop policy if exists "Class owners can read enrollments" on public.class_students;
drop policy if exists "Class owners can update enrollments" on public.class_students;
drop policy if exists "Class owners can delete enrollments" on public.class_students;

create policy "Teachers and admins can read class enrollments"
on public.class_students for select to authenticated
using (
  student_id = (select auth.uid())
  or public.elikha_is_admin()
  or (
    public.elikha_current_role() = 'teacher'
    and exists (
      select 1 from public.classes class_row
      where class_row.id = class_students.class_id
        and class_row.teacher_id = (select auth.uid())
    )
  )
);

create policy "Teachers and admins can insert class enrollments"
on public.class_students for insert to authenticated
with check (
  public.elikha_is_admin()
  or (
    public.elikha_current_role() = 'teacher'
    and exists (
      select 1 from public.classes class_row
      where class_row.id = class_students.class_id
        and class_row.teacher_id = (select auth.uid())
        and class_row.is_active is true
    )
  )
);

create policy "Teachers and admins can update class enrollments"
on public.class_students for update to authenticated
using (
  public.elikha_is_admin()
  or (
    public.elikha_current_role() = 'teacher'
    and exists (
      select 1 from public.classes class_row
      where class_row.id = class_students.class_id
        and class_row.teacher_id = (select auth.uid())
    )
  )
)
with check (
  public.elikha_is_admin()
  or (
    public.elikha_current_role() = 'teacher'
    and exists (
      select 1 from public.classes class_row
      where class_row.id = class_students.class_id
        and class_row.teacher_id = (select auth.uid())
    )
  )
);

create policy "Teachers and admins can delete class enrollments"
on public.class_students for delete to authenticated
using (
  public.elikha_is_admin()
  or (
    public.elikha_current_role() = 'teacher'
    and exists (
      select 1 from public.classes class_row
      where class_row.id = class_students.class_id
        and class_row.teacher_id = (select auth.uid())
    )
  )
);

revoke all on table public.class_students from anon;
grant select, insert, update, delete on table public.class_students to authenticated;

-- Replace the original PUBLIC/true activities policies with authenticated,
-- ownership-aware policies. Students can read only assigned activities;
-- parents keep their existing linked-child policy; administrators keep their
-- existing policies.
drop policy if exists "Teachers can manage own activities" on public.activities;
drop policy if exists "Teachers can delete own activities" on public.activities;
drop policy if exists "Teachers can insert activities" on public.activities;
drop policy if exists "Teachers can view activities" on public.activities;
drop policy if exists "Teachers can update own activities" on public.activities;

create policy "Teachers can read own activities"
on public.activities for select to authenticated
using (
  teacher_id = (select auth.uid())
  and public.elikha_current_role() = 'teacher'
);

create policy "Students can read assigned activities"
on public.activities for select to authenticated
using (
  public.elikha_current_role() = 'student'
  and private.elikha_student_has_activity(id)
);

create policy "Teachers can insert own activities"
on public.activities for insert to authenticated
with check (
  teacher_id = (select auth.uid())
  and public.elikha_current_role() = 'teacher'
  and (
    class_id is null
    or exists (
      select 1 from public.classes class_row
      where class_row.id = activities.class_id
        and class_row.teacher_id = (select auth.uid())
        and class_row.is_active is true
    )
  )
);

create policy "Teachers can update own activities"
on public.activities for update to authenticated
using (
  teacher_id = (select auth.uid())
  and public.elikha_current_role() = 'teacher'
)
with check (
  teacher_id = (select auth.uid())
  and public.elikha_current_role() = 'teacher'
  and (
    class_id is null
    or exists (
      select 1 from public.classes class_row
      where class_row.id = activities.class_id
        and class_row.teacher_id = (select auth.uid())
    )
  )
);

create policy "Teachers can delete own activities"
on public.activities for delete to authenticated
using (
  teacher_id = (select auth.uid())
  and public.elikha_current_role() = 'teacher'
);

create policy "Admins can insert activities"
on public.activities for insert to authenticated
with check (public.elikha_is_admin());

create policy "Admins can delete activities"
on public.activities for delete to authenticated
using (public.elikha_is_admin());

revoke all on table public.activities from anon;
grant select, insert, update, delete on table public.activities to authenticated;

-- Assignment rows are visible only to their learner, the owning teacher,
-- linked parents, and administrators. Only the owning teacher/admin can create
-- them; learners may update status only, with a trigger enforcing that column
-- boundary.
drop policy if exists "Allow insert activity assignments" on public.activity_assignments;
drop policy if exists "Allow view activity assignments" on public.activity_assignments;
drop policy if exists "Allow update activity assignments" on public.activity_assignments;

create policy "Students can read own activity assignments"
on public.activity_assignments for select to authenticated
using (
  student_id = (select auth.uid())
  and public.elikha_current_role() = 'student'
);

create policy "Teachers can read own activity assignments"
on public.activity_assignments for select to authenticated
using (
  public.elikha_current_role() = 'teacher'
  and exists (
    select 1 from public.activities activity
    where activity.id = activity_assignments.activity_id
      and activity.teacher_id = (select auth.uid())
  )
);

create policy "Teachers can insert own activity assignments"
on public.activity_assignments for insert to authenticated
with check (
  public.elikha_current_role() = 'teacher'
  and exists (
    select 1 from public.activities activity
    where activity.id = activity_assignments.activity_id
      and activity.teacher_id = (select auth.uid())
  )
);

create policy "Teachers can update own activity assignments"
on public.activity_assignments for update to authenticated
using (
  public.elikha_current_role() = 'teacher'
  and exists (
    select 1 from public.activities activity
    where activity.id = activity_assignments.activity_id
      and activity.teacher_id = (select auth.uid())
  )
)
with check (
  public.elikha_current_role() = 'teacher'
  and exists (
    select 1 from public.activities activity
    where activity.id = activity_assignments.activity_id
      and activity.teacher_id = (select auth.uid())
  )
);

create policy "Teachers can delete own activity assignments"
on public.activity_assignments for delete to authenticated
using (
  public.elikha_current_role() = 'teacher'
  and exists (
    select 1 from public.activities activity
    where activity.id = activity_assignments.activity_id
      and activity.teacher_id = (select auth.uid())
  )
);

create policy "Students can update own activity assignment status"
on public.activity_assignments for update to authenticated
using (
  student_id = (select auth.uid())
  and public.elikha_current_role() = 'student'
)
with check (
  student_id = (select auth.uid())
  and public.elikha_current_role() = 'student'
);

create or replace function private.elikha_guard_student_assignment_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() = old.student_id and public.elikha_current_role() = 'student' then
    if new.id is distinct from old.id
       or new.activity_id is distinct from old.activity_id
       or new.student_id is distinct from old.student_id
       or new.assigned_at is distinct from old.assigned_at then
      raise exception using
        errcode = '42501',
        message = 'Students may update assignment status only.';
    end if;

    if lower(coalesce(new.status, '')) not in ('assigned', 'pending', 'in_progress', 'submitted', 'late') then
      raise exception using
        errcode = '23514',
        message = 'Invalid student assignment status.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.elikha_guard_student_assignment_update()
  from public, anon, authenticated;

drop trigger if exists activity_assignments_guard_student_update
  on public.activity_assignments;
create trigger activity_assignments_guard_student_update
before update on public.activity_assignments
for each row execute function private.elikha_guard_student_assignment_update();

revoke all on table public.activity_assignments from anon;
grant select, insert, update, delete on table public.activity_assignments to authenticated;

-- Creating an activity and its class assignments is one transaction. This
-- prevents a visible activity from being left half-created if an enrollment
-- assignment fails part-way through a browser request.
create or replace function public.create_activity_with_assignments(
  p_teacher_id uuid,
  p_title text,
  p_description text default null,
  p_class_id uuid default null,
  p_grade text default null,
  p_subject text default null,
  p_due_date timestamp without time zone default null,
  p_status text default 'active',
  p_image_url text default null,
  p_rubric_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text := coalesce(public.elikha_current_role(), '');
  activity_row public.activities;
begin
  if auth.uid() is null
     or actor_role not in ('teacher', 'admin', 'superadmin')
     or (actor_role = 'teacher' and auth.uid() <> p_teacher_id) then
    raise exception using errcode = '42501', message = 'Not allowed to create this activity.';
  end if;

  if nullif(trim(coalesce(p_title, '')), '') is null then
    raise exception using errcode = '22023', message = 'Activity title is required.';
  end if;

  if p_class_id is not null and not exists (
    select 1 from public.classes class_row
    where class_row.id = p_class_id
      and class_row.teacher_id = p_teacher_id
      and class_row.is_active is true
  ) then
    raise exception using errcode = '22023', message = 'Choose an active class owned by the activity teacher.';
  end if;

  insert into public.activities (
    teacher_id, title, description, class_id, grade, subject,
    due_date, status, image_url
  ) values (
    p_teacher_id, trim(p_title), p_description, p_class_id, p_grade, p_subject,
    p_due_date, coalesce(nullif(trim(p_status), ''), 'active'), p_image_url
  ) returning * into activity_row;

  if p_class_id is not null then
    insert into public.activity_assignments (activity_id, student_id, status)
    select activity_row.id, enrollment.student_id, 'pending'
    from public.class_students enrollment
    join public.users account on account.id = enrollment.student_id
    where enrollment.class_id = p_class_id
      and lower(coalesce(account.role, '')) = 'student'
    on conflict (activity_id, student_id) do nothing;
  end if;

  if p_rubric_id is not null then
    if not exists (
      select 1 from public.rubrics rubric
      where rubric.id = p_rubric_id
        and rubric.teacher_id = p_teacher_id
        and case
          when jsonb_typeof(rubric.criteria) = 'array'
            then jsonb_array_length(rubric.criteria) > 0
          else false
        end
    ) then
      raise exception using errcode = '42501', message = 'The selected rubric is not available to this activity teacher or has no criteria.';
    end if;

    insert into public.activity_rubrics (
      activity_id, rubric_id, rubric_snapshot, rubric_version, assigned_at
    )
    select
      activity_row.id,
      rubric.id,
      jsonb_build_object(
        'id', rubric.id,
        'title', rubric.title,
        'description', rubric.description,
        'criteria', rubric.criteria,
        'metadata', rubric.metadata,
        'updated_at', rubric.updated_at
      ),
      coalesce(rubric.metadata->>'version', '1'),
      now()
    from public.rubrics rubric
    where rubric.id = p_rubric_id;
  end if;

  return to_jsonb(activity_row);
end;
$$;

revoke all on function public.create_activity_with_assignments(
  uuid, text, text, uuid, text, text, timestamp without time zone, text, text, uuid
) from public, anon;
grant execute on function public.create_activity_with_assignments(
  uuid, text, text, uuid, text, text, timestamp without time zone, text, text, uuid
) to authenticated;

-- Activity-lock alerts are a separate event stream from gesture detection.
-- A missing lock-alert table must never be worked around by creating a false
-- gesture incident, so create the canonical table and bind every insert to the
-- authenticated learner's real assignment.
create table if not exists public.activity_lock_alerts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.activity_lock_alerts'::regclass
      and constraint_row.conname = 'activity_lock_alerts_event_type_check'
  ) then
    alter table public.activity_lock_alerts
      add constraint activity_lock_alerts_event_type_check
      check (event_type in ('student_unlocked', 'left_activity', 'fullscreen_exited'));
  end if;
end;
$$;

create index if not exists activity_lock_alerts_activity_created_idx
  on public.activity_lock_alerts (activity_id, created_at desc);
create index if not exists activity_lock_alerts_student_created_idx
  on public.activity_lock_alerts (student_id, created_at desc);

alter table public.activity_lock_alerts enable row level security;
alter table public.activity_lock_alerts force row level security;

drop policy if exists "Students can report their activity lock events"
  on public.activity_lock_alerts;
drop policy if exists "Teachers can read activity lock alerts for their activities"
  on public.activity_lock_alerts;
drop policy if exists "Administrators can read activity lock alerts"
  on public.activity_lock_alerts;

create policy "Students can report their activity lock events"
on public.activity_lock_alerts for insert to authenticated
with check (
  student_id = (select auth.uid())
  and public.elikha_current_role() = 'student'
  and exists (
    select 1
    from public.activity_assignments assignment
    where assignment.activity_id = activity_lock_alerts.activity_id
      and assignment.student_id = (select auth.uid())
  )
);

create policy "Teachers can read activity lock alerts for their activities"
on public.activity_lock_alerts for select to authenticated
using (
  public.elikha_current_role() = 'teacher'
  and exists (
    select 1
    from public.activities activity
    where activity.id = activity_lock_alerts.activity_id
      and activity.teacher_id = (select auth.uid())
  )
);

create policy "Administrators can read activity lock alerts"
on public.activity_lock_alerts for select to authenticated
using (public.elikha_current_role() in ('admin', 'superadmin'));

revoke all on table public.activity_lock_alerts from public, anon;
grant select, insert on table public.activity_lock_alerts to authenticated;

-- Gesture alerts must be bound to the signed-in learner or requesting teacher.
drop policy if exists "Students can insert their own gesture alerts"
  on public.gesture_alerts;
revoke all on table public.gesture_alerts from anon;
revoke insert, update, delete on table public.gesture_alerts from authenticated;
grant select on table public.gesture_alerts to authenticated;

create or replace function public.log_gesture_alert(
  p_student_id uuid,
  p_activity_id uuid,
  p_gesture_type text default 'middle_finger',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alert_id uuid;
begin
  if auth.uid() is null
     or auth.uid() <> p_student_id
     or coalesce(public.elikha_current_role(), '') <> 'student' then
    raise exception using errcode = '42501', message = 'Not allowed to log this gesture alert.';
  end if;

  if coalesce(trim(lower(p_gesture_type)), '') <> 'middle_finger' then
    raise exception 'Unsupported gesture type.';
  end if;

  if not exists (
    select 1 from public.activity_assignments assignment
    where assignment.activity_id = p_activity_id
      and assignment.student_id = auth.uid()
  ) then
    raise exception 'Student is not assigned to this activity.';
  end if;

  insert into public.gesture_alerts (
    student_id, activity_id, gesture_type, metadata
  ) values (
    auth.uid(), p_activity_id, 'middle_finger', coalesce(p_metadata, '{}'::jsonb)
  ) returning id into v_alert_id;

  return v_alert_id;
end;
$$;

create or replace function public.get_teacher_gesture_alerts(p_teacher_id uuid)
returns table (
  id uuid,
  student_id uuid,
  activity_id uuid,
  gesture_type text,
  metadata jsonb,
  created_at timestamptz,
  student_name text,
  student_email text,
  activity_title text,
  class_name text,
  class_grade text,
  class_section text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or (
       auth.uid() <> p_teacher_id
       and coalesce(public.elikha_current_role(), '') not in ('admin', 'superadmin')
     )
     or (
       auth.uid() = p_teacher_id
       and coalesce(public.elikha_current_role(), '') <> 'teacher'
     ) then
    raise exception using errcode = '42501', message = 'Not allowed to read these gesture alerts.';
  end if;

  return query
  select
    alert.id,
    alert.student_id,
    alert.activity_id,
    alert.gesture_type,
    alert.metadata,
    alert.created_at,
    coalesce(account.name, 'Student'),
    coalesce(account.email, ''),
    coalesce(activity.title, 'Untitled activity'),
    coalesce(class_row.name, 'No class'),
    coalesce(class_row.grade, ''),
    coalesce(class_row.section, '')
  from public.gesture_alerts alert
  join public.activities activity on activity.id = alert.activity_id
  left join public.classes class_row on class_row.id = activity.class_id
  left join public.users account on account.id = alert.student_id
  where activity.teacher_id = p_teacher_id
  order by alert.created_at desc;
end;
$$;

revoke all on function public.log_gesture_alert(uuid, uuid, text, jsonb)
  from public, anon;
grant execute on function public.log_gesture_alert(uuid, uuid, text, jsonb)
  to authenticated;

revoke all on function public.get_teacher_gesture_alerts(uuid)
  from public, anon;
grant execute on function public.get_teacher_gesture_alerts(uuid)
  to authenticated;

revoke execute on function public.enroll_student_to_class(uuid, text) from anon;
grant execute on function public.enroll_student_to_class(uuid, text) to authenticated;

-- Enforce one canonical submission per assigned learner/activity and retain the
-- assignment key for reporting. Existing rows are backfilled before adding the
-- constraint.
update public.submissions submission
set assignment_id = assignment.id
from public.activity_assignments assignment
where submission.assignment_id is null
  and assignment.activity_id = submission.activity_id
  and assignment.student_id = submission.student_id;

create unique index if not exists submissions_activity_student_unique_idx
  on public.submissions (activity_id, student_id);

create index if not exists submissions_assignment_id_idx
  on public.submissions (assignment_id)
  where assignment_id is not null;

alter table public.submissions
  alter column assignment_id set not null;

drop policy if exists "Students can submit submissions" on public.submissions;
drop policy if exists "Students can update own submissions" on public.submissions;

revoke all on table public.submissions from anon;
grant select on table public.submissions to authenticated;

create policy "Students can insert assigned submissions"
on public.submissions for insert to authenticated
with check (
  student_id = (select auth.uid())
  and public.elikha_current_role() = 'student'
  and assignment_id is not null
  and score is null
  and feedback is null
  and reviewed_at is null
  and reviewed_by is null
  and lower(coalesce(status, '')) in ('submitted', 'late')
  and exists (
    select 1 from public.activity_assignments assignment
    where assignment.id = submissions.assignment_id
      and assignment.activity_id = submissions.activity_id
      and assignment.student_id = (select auth.uid())
  )
);

create policy "Students can update unreviewed submissions"
on public.submissions for update to authenticated
using (
  student_id = (select auth.uid())
  and public.elikha_current_role() = 'student'
  and reviewed_at is null
  and lower(coalesce(status, '')) not in ('reviewed', 'graded', 'completed')
)
with check (
  student_id = (select auth.uid())
  and public.elikha_current_role() = 'student'
  and reviewed_at is null
  and score is null
  and feedback is null
  and reviewed_by is null
  and lower(coalesce(status, '')) in ('submitted', 'late')
  and assignment_id is not null
  and exists (
    select 1 from public.activity_assignments assignment
    where assignment.id = submissions.assignment_id
      and assignment.activity_id = submissions.activity_id
      and assignment.student_id = (select auth.uid())
  )
);

create or replace function private.elikha_guard_student_submission_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() = old.student_id and public.elikha_current_role() = 'student' then
    if old.reviewed_at is not null
       or lower(coalesce(old.status, '')) in ('reviewed', 'graded', 'completed') then
      raise exception using
        errcode = '42501',
        message = 'Reviewed submissions cannot be changed by the learner.';
    end if;

    if new.id is distinct from old.id
       or new.activity_id is distinct from old.activity_id
       or new.student_id is distinct from old.student_id
       or new.assignment_id is distinct from old.assignment_id
       or new.score is distinct from old.score
       or new.feedback is distinct from old.feedback
       or new.reviewed_at is distinct from old.reviewed_at
       or new.reviewed_by is distinct from old.reviewed_by then
      raise exception using
        errcode = '42501',
        message = 'Learners may only update their unreviewed artwork submission.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.elikha_guard_student_submission_update()
  from public, anon, authenticated;

drop trigger if exists submissions_guard_student_update on public.submissions;
create trigger submissions_guard_student_update
before update on public.submissions
for each row execute function private.elikha_guard_student_submission_update();

-- Submission and assignment status move together, and the signed-in identity
-- is checked inside the database instead of trusting IDs supplied by React.
create or replace function public.submit_assigned_activity(
  p_student_id uuid,
  p_activity_id uuid,
  p_artwork_url text default null,
  p_description text default null,
  p_artwork_title text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  assignment_row public.activity_assignments;
  submission_row public.submissions;
  activity_due_date timestamp without time zone;
  submission_status text := 'submitted';
begin
  if auth.uid() is null
     or auth.uid() <> p_student_id
     or coalesce(public.elikha_current_role(), '') <> 'student' then
    raise exception using errcode = '42501', message = 'Not allowed to submit for this learner.';
  end if;

  if nullif(trim(coalesce(p_artwork_url, '')), '') is null
     or nullif(trim(coalesce(p_description, '')), '') is null then
    raise exception using errcode = '22023', message = 'A captured artwork image and AR state are required.';
  end if;

  select assignment.* into assignment_row
  from public.activity_assignments assignment
  join public.activities activity on activity.id = assignment.activity_id
  left join public.classes class_row on class_row.id = activity.class_id
  where assignment.activity_id = p_activity_id
    and assignment.student_id = auth.uid()
    and (activity.class_id is null or class_row.is_active is true)
  for update of assignment;

  if assignment_row.id is null then
    raise exception using errcode = '42501', message = 'This activity is not assigned to the learner.';
  end if;

  select activity.due_date into activity_due_date
  from public.activities activity
  where activity.id = p_activity_id
  for share;

  if activity_due_date is not null
     and private.elikha_due_instant(activity_due_date) < now() then
    submission_status := 'late';
  end if;

  select submission.* into submission_row
  from public.submissions submission
  where submission.activity_id = p_activity_id
    and submission.student_id = auth.uid()
  for update;

  if submission_row.id is not null and (
    submission_row.reviewed_at is not null
    or lower(coalesce(submission_row.status, '')) in ('reviewed', 'graded', 'completed')
  ) then
    raise exception using errcode = '42501', message = 'Reviewed work cannot be resubmitted.';
  end if;

  if submission_row.id is null then
    insert into public.submissions (
      activity_id, student_id, assignment_id, artwork_url, description,
      submitted_at, status, score, feedback, reviewed_at, reviewed_by
    ) values (
      p_activity_id, auth.uid(), assignment_row.id, p_artwork_url, p_description,
      now() at time zone 'UTC', submission_status, null, null, null, null
    ) returning * into submission_row;
  else
    update public.submissions
    set assignment_id = assignment_row.id,
        artwork_url = p_artwork_url,
        description = p_description,
        submitted_at = now() at time zone 'UTC',
        status = submission_status
    where id = submission_row.id
    returning * into submission_row;
  end if;

  update public.activity_assignments
  set status = submission_status
  where id = assignment_row.id;

  delete from public.artworks
  where submission_id = submission_row.id;

  insert into public.artworks (
    student_id, submission_id, title, description, image_url
  ) values (
    auth.uid(),
    submission_row.id,
    coalesce(nullif(trim(p_artwork_title), ''), 'AR Submission'),
    'AR model snapshot',
    p_artwork_url
  );

  return to_jsonb(submission_row);
end;
$$;

revoke all on function public.submit_assigned_activity(uuid, uuid, text, text, text)
  from public, anon;
grant execute on function public.submit_assigned_activity(uuid, uuid, text, text, text)
  to authenticated;

-- Direct table writes are intentionally disabled. The validated RPC above is
-- the only browser submission path; teachers grade through the atomic review
-- RPC below and administrators only need SELECT for reporting.
drop policy if exists "Students can insert assigned submissions" on public.submissions;
drop policy if exists "Students can update unreviewed submissions" on public.submissions;
drop policy if exists "Teachers can grade submissions" on public.submissions;

-- Final grade and rubric evidence are committed together. A rubric write error
-- now rolls the grade back instead of leaving the review in a partial state.
create or replace function public.finalize_submission_review(
  p_submission_id uuid,
  p_teacher_id uuid,
  p_score integer,
  p_feedback text default '',
  p_observation jsonb default null,
  p_criteria jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text := coalesce(public.elikha_current_role(), '');
  submission_row public.submissions;
  observation_id uuid;
  observation_activity_id uuid;
  observation_learner_id uuid;
begin
  if auth.uid() is null
     or auth.uid() <> p_teacher_id
     or actor_role <> 'teacher' then
    raise exception using errcode = '42501', message = 'Only the owning teacher can finalize this review.';
  end if;

  if p_score is null or p_score < 1 or p_score > 5 then
    raise exception using errcode = '22023', message = 'Rating must be between 1 and 5.';
  end if;

  select submission.* into submission_row
  from public.submissions submission
  join public.activities activity on activity.id = submission.activity_id
  where submission.id = p_submission_id
    and activity.teacher_id = auth.uid()
  for update of submission;

  if submission_row.id is null then
    raise exception using errcode = '42501', message = 'Submission was not found for this teacher.';
  end if;

  if p_observation is not null then
    observation_activity_id := nullif(p_observation->>'activity_id', '')::uuid;
    observation_learner_id := nullif(p_observation->>'learner_id', '')::uuid;

    if observation_activity_id is distinct from submission_row.activity_id
       or observation_learner_id is distinct from submission_row.student_id
       or nullif(p_observation->>'observer_id', '')::uuid is distinct from auth.uid()
       or jsonb_typeof(coalesce(p_criteria, '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(p_criteria, '[]'::jsonb)) = 0 then
      raise exception using errcode = '22023', message = 'Rubric evidence does not match this submission.';
    end if;

    if not exists (
      select 1 from public.activity_rubrics assignment
      where assignment.activity_id = submission_row.activity_id
        and assignment.rubric_id = nullif(p_observation->>'rubric_id', '')::uuid
    ) then
      raise exception using errcode = '22023', message = 'This rubric is not attached to the activity.';
    end if;

    insert into public.rubric_observations (
      rubric_id, rubric_version, class_id, learner_id, activity_id,
      activity_name, observer_id, observation_date, overall_comment,
      evidence_url, technical_conditions, technical_notes, next_steps,
      teacher_confirmed_at, ai_evaluation_id
    ) values (
      nullif(p_observation->>'rubric_id', '')::uuid,
      coalesce(nullif(p_observation->>'rubric_version', ''), '1'),
      nullif(p_observation->>'class_id', '')::uuid,
      observation_learner_id,
      observation_activity_id,
      nullif(p_observation->>'activity_name', ''),
      auth.uid(),
      coalesce(nullif(p_observation->>'observation_date', '')::date, current_date),
      nullif(p_observation->>'overall_comment', ''),
      nullif(p_observation->>'evidence_url', ''),
      coalesce(p_observation->'technical_conditions', '[]'::jsonb),
      nullif(p_observation->>'technical_notes', ''),
      nullif(p_observation->>'next_steps', ''),
      coalesce(nullif(p_observation->>'teacher_confirmed_at', '')::timestamptz, now()),
      nullif(p_observation->>'ai_evaluation_id', '')::uuid
    ) returning id into observation_id;

    insert into public.rubric_criterion_observations (
      observation_id, criterion_index, criterion_title_snapshot,
      beginning_descriptor_snapshot, developing_descriptor_snapshot,
      consistent_descriptor_snapshot, selected_rating, teacher_note
    )
    select
      observation_id,
      (criterion->>'criterion_index')::integer,
      criterion->>'criterion_title_snapshot',
      criterion->>'beginning_descriptor_snapshot',
      criterion->>'developing_descriptor_snapshot',
      criterion->>'consistent_descriptor_snapshot',
      upper(criterion->>'selected_rating'),
      nullif(criterion->>'teacher_note', '')
    from jsonb_array_elements(p_criteria) criterion;
  end if;

  update public.submissions
  set score = p_score,
      feedback = coalesce(p_feedback, ''),
      status = 'reviewed',
      reviewed_at = now() at time zone 'UTC',
      reviewed_by = auth.uid()
  where id = submission_row.id
  returning * into submission_row;

  return to_jsonb(submission_row);
end;
$$;

revoke all on function public.finalize_submission_review(
  uuid, uuid, integer, text, jsonb, jsonb
) from public, anon;
grant execute on function public.finalize_submission_review(
  uuid, uuid, integer, text, jsonb, jsonb
) to authenticated;

-- Artwork gallery rows are written after a successful submission. Limit them
-- to the signed-in learner and require the linked submission to belong to the
-- same learner, preventing arbitrary gallery inserts.
drop policy if exists "Students can insert own artworks" on public.artworks;
create policy "Students can insert own artworks"
on public.artworks for insert to authenticated
with check (
  student_id = (select auth.uid())
  and public.elikha_current_role() = 'student'
  and submission_id is not null
  and exists (
    select 1 from public.submissions submission
    where submission.id = artworks.submission_id
      and submission.student_id = (select auth.uid())
  )
);

revoke all on table public.artworks from anon;
grant select, insert on table public.artworks to authenticated;
