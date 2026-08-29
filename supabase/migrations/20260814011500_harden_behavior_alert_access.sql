-- Repair the deployed behavior-alert authorization boundary independently of
-- the larger release hardening migration. Gesture alerts are RPC-only; lock
-- alerts retain their direct insert/select client contract under strict RLS.

do $$
begin
  if to_regclass('public.gesture_alerts') is null then
    raise exception using
      errcode = '42P01',
      message = 'Required table public.gesture_alerts does not exist.';
  end if;

  if to_regprocedure('public.elikha_current_role()') is null then
    raise exception using
      errcode = '42883',
      message = 'Required function public.elikha_current_role() does not exist.';
  end if;
end;
$$;

-- No browser role may write gesture incidents directly. SECURITY DEFINER RPCs
-- below are the only browser-facing read/write boundary for this table.
alter table public.gesture_alerts enable row level security;
alter table public.gesture_alerts force row level security;

drop policy if exists "Students can insert their own gesture alerts"
  on public.gesture_alerts;

revoke all on table public.gesture_alerts from public, anon, authenticated;

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
  actor_id uuid := auth.uid();
  actor_role text := coalesce(public.elikha_current_role(), '');
  alert_id uuid;
begin
  if actor_id is null
     or p_student_id is distinct from actor_id
     or actor_role <> 'student' then
    raise exception using
      errcode = '42501',
      message = 'Not allowed to log this gesture alert.';
  end if;

  if coalesce(trim(lower(p_gesture_type)), '') <> 'middle_finger' then
    raise exception 'Unsupported gesture type.';
  end if;

  if not exists (
    select 1
    from public.activity_assignments assignment
    where assignment.activity_id = p_activity_id
      and assignment.student_id = actor_id
  ) then
    raise exception 'Student is not assigned to this activity.';
  end if;

  insert into public.gesture_alerts (
    student_id,
    activity_id,
    gesture_type,
    metadata
  ) values (
    actor_id,
    p_activity_id,
    'middle_finger',
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into alert_id;

  return alert_id;
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
declare
  actor_id uuid := auth.uid();
  actor_role text := coalesce(public.elikha_current_role(), '');
begin
  if actor_id is null
     or p_teacher_id is null
     or not (
       (actor_role = 'teacher' and actor_id = p_teacher_id)
       or actor_role in ('admin', 'superadmin')
     ) then
    raise exception using
      errcode = '42501',
      message = 'Not allowed to read these gesture alerts.';
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
  from public, anon, authenticated;
grant execute on function public.log_gesture_alert(uuid, uuid, text, jsonb)
  to authenticated;

revoke all on function public.get_teacher_gesture_alerts(uuid)
  from public, anon, authenticated;
grant execute on function public.get_teacher_gesture_alerts(uuid)
  to authenticated;

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

-- Supabase installations may carry broad default table privileges for the
-- authenticated role. RLS does not govern TRUNCATE, so explicitly retain only
-- the read/report operations used by the clients.
revoke update, delete, truncate, references, trigger
  on table public.activity_lock_alerts from authenticated;
