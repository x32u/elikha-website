alter table public.activities
  add column if not exists max_points integer not null default 5;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.activities'::regclass
      and constraint_row.conname = 'activities_max_points_check'
  ) then
    alter table public.activities
      add constraint activities_max_points_check
      check (max_points between 1 and 1000);
  end if;
end;
$$;

drop function if exists public.create_activity_with_assignments(
  uuid, text, text, uuid, text, text, timestamp without time zone, text, text, uuid
);

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
  p_rubric_id uuid default null,
  p_max_points integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text := coalesce(public.elikha_current_role(), '');
  activity_row public.activities;
  rubric_state jsonb;
begin
  if auth.uid() is null
     or actor_role not in ('teacher', 'admin', 'superadmin')
     or (actor_role = 'teacher' and auth.uid() <> p_teacher_id) then
    raise exception using errcode = '42501', message = 'Not allowed to create this activity.';
  end if;

  if nullif(trim(coalesce(p_title, '')), '') is null then
    raise exception using errcode = '22023', message = 'Activity title is required.';
  end if;

  if p_max_points is null or p_max_points < 1 or p_max_points > 1000 then
    raise exception using errcode = '22023', message = 'Maximum points must be between 1 and 1000.';
  end if;

  if not exists (
    select 1
    from public.users teacher_account
    where teacher_account.id = p_teacher_id
      and lower(coalesce(teacher_account.role, '')) = 'teacher'
  ) then
    raise exception using errcode = '22023', message = 'Choose a valid teacher account.';
  end if;

  if p_class_id is null or not exists (
    select 1 from public.classes class_row
    where class_row.id = p_class_id
      and class_row.teacher_id = p_teacher_id
      and class_row.is_active is true
  ) then
    raise exception using errcode = '22023', message = 'Choose an active class owned by the activity teacher.';
  end if;

  insert into public.activities (
    teacher_id, title, description, class_id, grade, subject,
    due_date, status, image_url, max_points
  ) values (
    p_teacher_id, trim(p_title), p_description, p_class_id, p_grade, p_subject,
    p_due_date, coalesce(nullif(trim(p_status), ''), 'active'), p_image_url, p_max_points
  ) returning * into activity_row;

  insert into public.activity_assignments (activity_id, student_id, status)
  select activity_row.id, enrollment.student_id, 'pending'
  from public.class_students enrollment
  join public.users account on account.id = enrollment.student_id
  where enrollment.class_id = p_class_id
    and lower(coalesce(account.role, '')) = 'student'
  on conflict (activity_id, student_id) do nothing;

  if p_rubric_id is not null then
    rubric_state := private.elikha_apply_activity_rubric(
      activity_row.id,
      p_teacher_id,
      'set',
      p_rubric_id
    );
  else
    rubric_state := private.elikha_activity_rubric_state(activity_row.id);
  end if;

  return to_jsonb(activity_row) || jsonb_build_object(
    'rubric_id', rubric_state->'rubric_id',
    'rubric_title', rubric_state->'rubric_title',
    'rubric_version', rubric_state->'rubric_version',
    'rubric_change_locked', rubric_state->'change_locked',
    'rubric_lock_reason', rubric_state->'lock_reason'
  );
end;
$$;

revoke all on function public.create_activity_with_assignments(
  uuid, text, text, uuid, text, text, timestamp without time zone, text, text, uuid, integer
) from public, anon;
grant execute on function public.create_activity_with_assignments(
  uuid, text, text, uuid, text, text, timestamp without time zone, text, text, uuid, integer
) to authenticated;

drop function if exists public.update_activity_with_rubric(
  uuid, text, text, timestamp without time zone, text, text, uuid
);

create or replace function public.update_activity_with_rubric(
  p_activity_id uuid,
  p_title text,
  p_description text default null,
  p_due_date timestamp without time zone default null,
  p_image_url text default null,
  p_rubric_action text default 'keep',
  p_rubric_id uuid default null,
  p_max_points integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text := coalesce(public.elikha_current_role(), '');
  activity_row public.activities;
  rubric_state jsonb;
begin
  if auth.uid() is null or actor_role not in ('teacher', 'admin', 'superadmin') then
    raise exception using errcode = '42501', message = 'Not allowed to update this activity.';
  end if;

  select activity.*
  into activity_row
  from public.activities activity
  where activity.id = p_activity_id
  for update;

  if activity_row.id is null
     or (actor_role = 'teacher' and activity_row.teacher_id <> auth.uid()) then
    raise exception using errcode = '42501', message = 'Activity not found for this account.';
  end if;

  if actor_role = 'teacher' and not exists (
    select 1
    from public.classes class_row
    where class_row.id = activity_row.class_id
      and class_row.teacher_id = auth.uid()
      and class_row.is_active is true
  ) then
    raise exception using errcode = '55000', message = 'Restore this class before editing its activities.';
  end if;

  if nullif(trim(coalesce(p_title, '')), '') is null then
    raise exception using errcode = '22023', message = 'Activity title is required.';
  end if;

  if p_max_points is not null and (p_max_points < 1 or p_max_points > 1000) then
    raise exception using errcode = '22023', message = 'Maximum points must be between 1 and 1000.';
  end if;

  update public.activities activity
  set title = trim(p_title),
      description = p_description,
      due_date = p_due_date,
      image_url = p_image_url,
      max_points = coalesce(p_max_points, activity.max_points),
      updated_at = timezone('utc', now())
  where activity.id = p_activity_id
  returning * into activity_row;

  rubric_state := private.elikha_apply_activity_rubric(
    activity_row.id,
    activity_row.teacher_id,
    p_rubric_action,
    p_rubric_id
  );

  return to_jsonb(activity_row) || jsonb_build_object(
    'rubric_id', rubric_state->'rubric_id',
    'rubric_title', rubric_state->'rubric_title',
    'rubric_version', rubric_state->'rubric_version',
    'rubric_change_locked', rubric_state->'change_locked',
    'rubric_lock_reason', rubric_state->'lock_reason'
  );
end;
$$;

revoke all on function public.update_activity_with_rubric(
  uuid, text, text, timestamp without time zone, text, text, uuid, integer
) from public, anon;
grant execute on function public.update_activity_with_rubric(
  uuid, text, text, timestamp without time zone, text, text, uuid, integer
) to authenticated;
