-- Create and edit activities together with their immutable rubric snapshot.
-- Every mutation is checked server-side because the snapshot is part of the
-- AI/teacher review contract and must not be replaceable after dependent work.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.elikha_activity_rubric_state(
  p_activity_id uuid
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with attachment as (
    select
      assigned.rubric_id,
      assigned.rubric_version,
      assigned.rubric_snapshot,
      assigned.assigned_at
    from public.activity_rubrics assigned
    where assigned.activity_id = p_activity_id
  ), dependency_state as (
    select
      exists (
        select 1 from public.submissions submission
        where submission.activity_id = p_activity_id
      ) as has_submissions,
      exists (
        select 1 from public.submission_ai_evaluations evaluation
        where evaluation.activity_id = p_activity_id
      ) as has_ai_evaluations,
      exists (
        select 1 from public.rubric_observations observation
        where observation.activity_id = p_activity_id
      ) as has_observations,
      exists (
        select 1
        from public.submissions submission
        where submission.activity_id = p_activity_id
          and (
            submission.reviewed_at is not null
            or submission.reviewed_by is not null
            or lower(coalesce(submission.status, '')) in ('reviewed', 'graded', 'completed')
          )
      ) as has_final_reviews
  )
  select jsonb_build_object(
    'rubric_id', attachment.rubric_id,
    'rubric_title', attachment.rubric_snapshot->>'title',
    'rubric_version', attachment.rubric_version,
    'assigned_at', attachment.assigned_at,
    'has_submissions', dependency_state.has_submissions,
    'change_locked', case
      when attachment.rubric_id is not null then
        dependency_state.has_submissions
        or dependency_state.has_ai_evaluations
        or dependency_state.has_observations
      else
        dependency_state.has_ai_evaluations
        or dependency_state.has_observations
        or dependency_state.has_final_reviews
      end,
    'lock_reason', case
      when attachment.rubric_id is not null and (
        dependency_state.has_submissions
        or dependency_state.has_ai_evaluations
        or dependency_state.has_observations
      ) then 'This rubric is locked because student work already depends on its saved criteria.'
      when attachment.rubric_id is null and (
        dependency_state.has_ai_evaluations
        or dependency_state.has_observations
        or dependency_state.has_final_reviews
      ) then 'A rubric cannot be attached after this activity has already been evaluated or reviewed.'
      else null
    end
  )
  from dependency_state
  left join attachment on true;
$$;

revoke all on function private.elikha_activity_rubric_state(uuid)
  from public, anon, authenticated;

create or replace function private.elikha_apply_activity_rubric(
  p_activity_id uuid,
  p_teacher_id uuid,
  p_action text,
  p_rubric_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_action text := lower(trim(coalesce(p_action, 'keep')));
  current_attachment public.activity_rubrics;
  selected_rubric public.rubrics;
  dependency_state jsonb;
begin
  if normalized_action not in ('keep', 'set', 'remove') then
    raise exception using
      errcode = '22023',
      message = 'Rubric action must be keep, set, or remove.';
  end if;

  select assigned.*
  into current_attachment
  from public.activity_rubrics assigned
  where assigned.activity_id = p_activity_id
  for update;

  dependency_state := private.elikha_activity_rubric_state(p_activity_id);

  if normalized_action = 'keep' then
    return dependency_state;
  end if;

  if normalized_action = 'set' and p_rubric_id is null then
    raise exception using
      errcode = '22023',
      message = 'Choose a rubric to attach.';
  end if;

  -- Re-selecting the same rubric is intentionally a no-op. It must not refresh
  -- the frozen snapshot after the rubric template is edited later.
  if normalized_action = 'set'
     and current_attachment.activity_id is not null
     and current_attachment.rubric_id = p_rubric_id then
    return dependency_state;
  end if;

  if coalesce((dependency_state->>'change_locked')::boolean, false) then
    raise exception using
      errcode = '55000',
      message = coalesce(
        dependency_state->>'lock_reason',
        'This rubric can no longer be changed.'
      );
  end if;

  if normalized_action = 'remove' then
    delete from public.activity_rubrics assigned
    where assigned.activity_id = p_activity_id;
    return private.elikha_activity_rubric_state(p_activity_id);
  end if;

  select rubric.*
  into selected_rubric
  from public.rubrics rubric
  where rubric.id = p_rubric_id
    and rubric.teacher_id = p_teacher_id;

  if selected_rubric.id is null then
    raise exception using
      errcode = '42501',
      message = 'The selected rubric does not belong to this activity teacher.';
  end if;

  if coalesce(jsonb_typeof(selected_rubric.criteria), '') <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'The selected rubric criteria are invalid.';
  end if;

  if jsonb_array_length(selected_rubric.criteria) = 0 then
    raise exception using
      errcode = '22023',
      message = 'The selected rubric must contain at least one criterion.';
  end if;

  insert into public.activity_rubrics (
    activity_id,
    rubric_id,
    rubric_snapshot,
    rubric_version,
    assigned_at
  ) values (
    p_activity_id,
    selected_rubric.id,
    jsonb_build_object(
      'id', selected_rubric.id,
      'title', selected_rubric.title,
      'description', selected_rubric.description,
      'criteria', selected_rubric.criteria,
      'metadata', selected_rubric.metadata,
      'updated_at', selected_rubric.updated_at
    ),
    coalesce(selected_rubric.metadata->>'version', '1'),
    now()
  )
  on conflict (activity_id) do update
    set rubric_id = excluded.rubric_id,
        rubric_snapshot = excluded.rubric_snapshot,
        rubric_version = excluded.rubric_version,
        assigned_at = excluded.assigned_at;

  return private.elikha_activity_rubric_state(p_activity_id);
end;
$$;

revoke all on function private.elikha_apply_activity_rubric(
  uuid, uuid, text, uuid
) from public, anon, authenticated;

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
  rubric_state jsonb;
begin
  if auth.uid() is null
     or actor_role not in ('teacher', 'admin', 'superadmin')
     or (actor_role = 'teacher' and auth.uid() <> p_teacher_id) then
    raise exception using
      errcode = '42501',
      message = 'Not allowed to create this activity.';
  end if;

  if nullif(trim(coalesce(p_title, '')), '') is null then
    raise exception using
      errcode = '22023',
      message = 'Activity title is required.';
  end if;

  if not exists (
    select 1
    from public.users teacher_account
    where teacher_account.id = p_teacher_id
      and lower(coalesce(teacher_account.role, '')) = 'teacher'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Choose a valid activity teacher.';
  end if;

  if p_class_id is null or not exists (
    select 1
    from public.classes class_row
    where class_row.id = p_class_id
      and class_row.teacher_id = p_teacher_id
      and class_row.is_active is true
  ) then
    raise exception using
      errcode = '22023',
      message = 'Choose an active class owned by the activity teacher.';
  end if;

  insert into public.activities (
    teacher_id,
    title,
    description,
    class_id,
    grade,
    subject,
    due_date,
    status,
    image_url
  ) values (
    p_teacher_id,
    trim(p_title),
    p_description,
    p_class_id,
    p_grade,
    p_subject,
    p_due_date,
    coalesce(nullif(trim(p_status), ''), 'active'),
    p_image_url
  ) returning * into activity_row;

  insert into public.activity_assignments (activity_id, student_id, status)
  select activity_row.id, enrollment.student_id, 'pending'
  from public.class_students enrollment
  join public.users learner on learner.id = enrollment.student_id
  where enrollment.class_id = p_class_id
    and lower(coalesce(learner.role, '')) = 'student'
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
    'rubric_change_locked', rubric_state->'change_locked'
  );
end;
$$;

revoke all on function public.create_activity_with_assignments(
  uuid, text, text, uuid, text, text, timestamp without time zone, text, text, uuid
) from public, anon;
grant execute on function public.create_activity_with_assignments(
  uuid, text, text, uuid, text, text, timestamp without time zone, text, text, uuid
) to authenticated;

create or replace function public.update_activity_with_rubric(
  p_activity_id uuid,
  p_title text,
  p_description text default null,
  p_due_date timestamp without time zone default null,
  p_image_url text default null,
  p_rubric_action text default 'keep',
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
  rubric_state jsonb;
begin
  if auth.uid() is null or actor_role not in ('teacher', 'admin', 'superadmin') then
    raise exception using
      errcode = '42501',
      message = 'Not allowed to update this activity.';
  end if;

  select activity.*
  into activity_row
  from public.activities activity
  where activity.id = p_activity_id
  for update;

  if activity_row.id is null
     or (actor_role = 'teacher' and activity_row.teacher_id <> auth.uid()) then
    raise exception using
      errcode = '42501',
      message = 'Activity not found for this account.';
  end if;

  if actor_role = 'teacher' and not exists (
    select 1
    from public.classes class_row
    where class_row.id = activity_row.class_id
      and class_row.teacher_id = auth.uid()
      and class_row.is_active is true
  ) then
    raise exception using
      errcode = '55000',
      message = 'Restore this class before editing its activities.';
  end if;

  if nullif(trim(coalesce(p_title, '')), '') is null then
    raise exception using
      errcode = '22023',
      message = 'Activity title is required.';
  end if;

  update public.activities activity
  set title = trim(p_title),
      description = p_description,
      due_date = p_due_date,
      image_url = p_image_url,
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
  uuid, text, text, timestamp without time zone, text, text, uuid
) from public, anon;
grant execute on function public.update_activity_with_rubric(
  uuid, text, text, timestamp without time zone, text, text, uuid
) to authenticated;

create or replace function public.set_activity_rubric(
  p_activity_id uuid,
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
  if auth.uid() is null or actor_role not in ('teacher', 'admin', 'superadmin') then
    raise exception using
      errcode = '42501',
      message = 'Not allowed to change this activity rubric.';
  end if;

  select activity.*
  into activity_row
  from public.activities activity
  where activity.id = p_activity_id
  for update;

  if activity_row.id is null
     or (actor_role = 'teacher' and activity_row.teacher_id <> auth.uid()) then
    raise exception using
      errcode = '42501',
      message = 'Activity not found for this account.';
  end if;

  return private.elikha_apply_activity_rubric(
    activity_row.id,
    activity_row.teacher_id,
    case when p_rubric_id is null then 'remove' else 'set' end,
    p_rubric_id
  );
end;
$$;

revoke all on function public.set_activity_rubric(uuid, uuid)
  from public, anon;
grant execute on function public.set_activity_rubric(uuid, uuid)
  to authenticated;

create or replace function public.get_activity_rubric_management_state(
  p_activity_id uuid
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
  if auth.uid() is null or actor_role not in ('teacher', 'admin', 'superadmin') then
    raise exception using
      errcode = '42501',
      message = 'Not allowed to view rubric management details.';
  end if;

  select activity.*
  into activity_row
  from public.activities activity
  where activity.id = p_activity_id;

  if activity_row.id is null
     or (actor_role = 'teacher' and activity_row.teacher_id <> auth.uid()) then
    raise exception using
      errcode = '42501',
      message = 'Activity not found for this account.';
  end if;

  return private.elikha_activity_rubric_state(activity_row.id);
end;
$$;

revoke all on function public.get_activity_rubric_management_state(uuid)
  from public, anon;
grant execute on function public.get_activity_rubric_management_state(uuid)
  to authenticated;

create or replace function public.get_activity_rubric_options(
  p_teacher_id uuid default null
)
returns table (
  id uuid,
  title text,
  description text,
  rubric_version text,
  criteria_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_role text := coalesce(public.elikha_current_role(), '');
  target_teacher_id uuid;
begin
  if auth.uid() is null or actor_role not in ('teacher', 'admin', 'superadmin') then
    raise exception using
      errcode = '42501',
      message = 'Not allowed to list rubric options.';
  end if;

  target_teacher_id := case
    when actor_role = 'teacher' then auth.uid()
    else p_teacher_id
  end;

  if target_teacher_id is null
     or (actor_role = 'teacher' and p_teacher_id is not null and p_teacher_id <> auth.uid()) then
    raise exception using
      errcode = '42501',
      message = 'Rubric options are limited to the activity teacher.';
  end if;

  return query
  select
    rubric.id,
    rubric.title,
    rubric.description,
    coalesce(rubric.metadata->>'version', '1'),
    case
      when jsonb_typeof(rubric.criteria) = 'array'
        then jsonb_array_length(rubric.criteria)
      else 0
    end
  from public.rubrics rubric
  where rubric.teacher_id = target_teacher_id
    and case
      when jsonb_typeof(rubric.criteria) = 'array'
        then jsonb_array_length(rubric.criteria) > 0
      else false
    end
  order by rubric.created_at desc;
end;
$$;

revoke all on function public.get_activity_rubric_options(uuid)
  from public, anon;
grant execute on function public.get_activity_rubric_options(uuid)
  to authenticated;

-- Browser clients may read their policy-scoped attachment, but all snapshot
-- mutations must now go through the checked functions above.
revoke insert, update, delete on table public.activity_rubrics
  from authenticated;
grant select on table public.activity_rubrics to authenticated;
