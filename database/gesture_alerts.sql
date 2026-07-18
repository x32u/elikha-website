-- Gesture alerts logged from AR sessions.
-- Apply in Supabase SQL Editor before using teacher behavior alerts.

create table if not exists public.gesture_alerts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  gesture_type text not null
    check (gesture_type in ('middle_finger')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists gesture_alerts_created_at_idx
  on public.gesture_alerts(created_at desc);

create index if not exists gesture_alerts_activity_idx
  on public.gesture_alerts(activity_id, created_at desc);

create index if not exists gesture_alerts_student_idx
  on public.gesture_alerts(student_id, created_at desc);

alter table public.gesture_alerts enable row level security;

drop policy if exists "Students can insert their own gesture alerts"
  on public.gesture_alerts;

create policy "Students can insert their own gesture alerts"
on public.gesture_alerts
for insert
to anon, authenticated
with check (
  exists (
    select 1
    from public.activity_assignments aa
    where aa.activity_id = gesture_alerts.activity_id
      and aa.student_id = gesture_alerts.student_id
  )
);

drop policy if exists "Teachers can read gesture alerts for their activities"
  on public.gesture_alerts;

create policy "Teachers can read gesture alerts for their activities"
on public.gesture_alerts
for select
to authenticated
using (
  exists (
    select 1
    from public.activities a
    where a.id = gesture_alerts.activity_id
      and a.teacher_id = auth.uid()
  )
);

drop policy if exists "Super admins can read all gesture alerts"
  on public.gesture_alerts;

create policy "Super admins can read all gesture alerts"
on public.gesture_alerts
for select
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and lower(replace(replace(coalesce(u.role, ''), '_', ''), '-', '')) = 'superadmin'
  )
);

create or replace function public.log_gesture_alert(
  p_student_id uuid,
  p_activity_id uuid,
  p_gesture_type text default 'middle_finger',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alert_id uuid;
begin
  if p_student_id is null or p_activity_id is null then
    raise exception 'Student and activity are required.';
  end if;

  if coalesce(trim(lower(p_gesture_type)), '') <> 'middle_finger' then
    raise exception 'Unsupported gesture type.';
  end if;

  if not exists (
    select 1
    from public.activities a
    where a.id = p_activity_id
  ) then
    raise exception 'Activity not found.';
  end if;

  if not exists (
    select 1
    from public.activity_assignments aa
    where aa.activity_id = p_activity_id
      and aa.student_id = p_student_id
  ) then
    raise exception 'Student is not assigned to this activity.';
  end if;

  insert into public.gesture_alerts (
    student_id,
    activity_id,
    gesture_type,
    metadata
  )
  values (
    p_student_id,
    p_activity_id,
    'middle_finger',
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_alert_id;

  return v_alert_id;
end;
$$;

grant execute on function public.log_gesture_alert(uuid, uuid, text, jsonb)
to anon, authenticated;

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
language sql
security definer
set search_path = public
as $$
  select
    ga.id,
    ga.student_id,
    ga.activity_id,
    ga.gesture_type,
    ga.metadata,
    ga.created_at,
    coalesce(u.name, 'Student') as student_name,
    coalesce(u.email, '') as student_email,
    coalesce(a.title, 'Untitled activity') as activity_title,
    coalesce(c.name, 'No class') as class_name,
    coalesce(c.grade, '') as class_grade,
    coalesce(c.section, '') as class_section
  from public.gesture_alerts ga
  inner join public.activities a
    on a.id = ga.activity_id
  left join public.classes c
    on c.id = a.class_id
  left join public.users u
    on u.id = ga.student_id
  where a.teacher_id = p_teacher_id
  order by ga.created_at desc;
$$;

grant execute on function public.get_teacher_gesture_alerts(uuid)
to authenticated;
