-- Commit a teacher's final rating and rubric evidence atomically, then expose
-- only the attached rubric and teacher-confirmed result to the assigned learner.
-- Raw AI evaluations remain teacher/admin-only.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- Role and activity ownership are authorization inputs for the policies and
-- RPCs below. Protect those two fields before trusting them.
-- Public Auth signups always start as learners; privileged roles are assigned
-- later by an existing administrator through the protected profile table.
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

revoke all on function public.handle_new_user()
  from public, anon, authenticated;
revoke all on function public.sync_auth_user_profile()
  from public, anon, authenticated;

create or replace function private.elikha_guard_assessment_user_role()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() = old.id and new.role is distinct from old.role then
    raise exception using
      errcode = '42501',
      message = 'Users cannot change their own role.';
  end if;

  return new;
end;
$$;

revoke all on function private.elikha_guard_assessment_user_role()
  from public, anon, authenticated;

drop trigger if exists users_guard_assessment_role on public.users;
create trigger users_guard_assessment_role
before update on public.users
for each row execute function private.elikha_guard_assessment_user_role();

drop policy if exists "Teachers can manage own activities" on public.activities;
drop policy if exists "Teachers can delete own activities" on public.activities;
drop policy if exists "Teachers can insert activities" on public.activities;
drop policy if exists "Teachers can update own activities" on public.activities;

drop policy if exists "Teachers can insert own activities" on public.activities;
create policy "Teachers can insert own activities"
on public.activities for insert to authenticated
with check (
  teacher_id = (select auth.uid())
  and public.elikha_current_role() = 'teacher'
  and (
    class_id is null
    or exists (
      select 1
      from public.classes class_row
      where class_row.id = activities.class_id
        and class_row.teacher_id = (select auth.uid())
        and class_row.is_active is true
    )
  )
);

drop policy if exists "Teachers can update own activities" on public.activities;
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
      select 1
      from public.classes class_row
      where class_row.id = activities.class_id
        and class_row.teacher_id = (select auth.uid())
        and class_row.is_active is true
    )
  )
);

drop policy if exists "Teachers can delete own activities" on public.activities;
create policy "Teachers can delete own activities"
on public.activities for delete to authenticated
using (
  teacher_id = (select auth.uid())
  and public.elikha_current_role() = 'teacher'
);

revoke all on table public.activities from anon;
grant select, insert, update, delete on table public.activities to authenticated;

-- The assessment endpoint relies on a real assignment. Replace the legacy
-- public/true policies with learner/owner-scoped access so a browser cannot
-- manufacture an assignment to unlock another class's rubric. Existing parent
-- and administrator policies remain in place.
drop policy if exists "Allow insert activity assignments"
  on public.activity_assignments;
drop policy if exists "Allow view activity assignments"
  on public.activity_assignments;
drop policy if exists "Allow update activity assignments"
  on public.activity_assignments;

drop policy if exists "Students can read own activity assignments"
  on public.activity_assignments;
create policy "Students can read own activity assignments"
on public.activity_assignments for select to authenticated
using (
  student_id = (select auth.uid())
  and public.elikha_current_role() = 'student'
);

drop policy if exists "Teachers can read own activity assignments"
  on public.activity_assignments;
create policy "Teachers can read own activity assignments"
on public.activity_assignments for select to authenticated
using (
  public.elikha_current_role() = 'teacher'
  and exists (
    select 1
    from public.activities activity
    where activity.id = activity_assignments.activity_id
      and activity.teacher_id = (select auth.uid())
  )
);

drop policy if exists "Teachers can insert own activity assignments"
  on public.activity_assignments;
create policy "Teachers can insert own activity assignments"
on public.activity_assignments for insert to authenticated
with check (
  public.elikha_current_role() = 'teacher'
  and exists (
    select 1
    from public.activities activity
    where activity.id = activity_assignments.activity_id
      and activity.teacher_id = (select auth.uid())
  )
);

drop policy if exists "Teachers can update own activity assignments"
  on public.activity_assignments;
create policy "Teachers can update own activity assignments"
on public.activity_assignments for update to authenticated
using (
  public.elikha_current_role() = 'teacher'
  and exists (
    select 1
    from public.activities activity
    where activity.id = activity_assignments.activity_id
      and activity.teacher_id = (select auth.uid())
  )
)
with check (
  public.elikha_current_role() = 'teacher'
  and exists (
    select 1
    from public.activities activity
    where activity.id = activity_assignments.activity_id
      and activity.teacher_id = (select auth.uid())
  )
);

drop policy if exists "Teachers can delete own activity assignments"
  on public.activity_assignments;
create policy "Teachers can delete own activity assignments"
on public.activity_assignments for delete to authenticated
using (
  public.elikha_current_role() = 'teacher'
  and exists (
    select 1
    from public.activities activity
    where activity.id = activity_assignments.activity_id
      and activity.teacher_id = (select auth.uid())
  )
);

revoke all on table public.activity_assignments from anon;
grant select, insert, update, delete
  on table public.activity_assignments to authenticated;

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
  submission_row record;
  activity_rubric_row record;
  observation_id uuid;
  requested_ai_evaluation_id uuid;
  expected_criterion_count integer := 0;
  criteria_payload jsonb := coalesce(p_criteria, '[]'::jsonb);
begin
  if auth.uid() is null
     or auth.uid() <> p_teacher_id
     or actor_role <> 'teacher' then
    raise exception using
      errcode = '42501',
      message = 'Only the owning teacher can finalize this review.';
  end if;

  if p_score is null or p_score < 1 or p_score > 5 then
    raise exception using
      errcode = '22023',
      message = 'Rating must be between 1 and 5.';
  end if;

  select
    submission.*,
    activity.class_id as assessment_class_id,
    activity.title as assessment_activity_title
  into submission_row
  from public.submissions submission
  join public.activities activity on activity.id = submission.activity_id
  where submission.id = p_submission_id
    and activity.teacher_id = auth.uid()
  for update of submission;

  if submission_row.id is null then
    raise exception using
      errcode = '42501',
      message = 'Submission was not found for this teacher.';
  end if;

  select
    assignment.rubric_id,
    assignment.rubric_snapshot,
    assignment.rubric_version
  into activity_rubric_row
  from public.activity_rubrics assignment
  where assignment.activity_id = submission_row.activity_id
  order by assignment.assigned_at desc
  limit 1;

  if activity_rubric_row.rubric_id is not null and p_observation is null then
    raise exception using
      errcode = '22023',
      message = 'Complete the attached rubric before finalizing this review.';
  end if;

  if activity_rubric_row.rubric_id is null and p_observation is not null then
    raise exception using
      errcode = '22023',
      message = 'No rubric is attached to this activity.';
  end if;

  if p_observation is not null then
    if nullif(p_observation->>'rubric_id', '')::uuid
         is distinct from activity_rubric_row.rubric_id
       or nullif(p_observation->>'learner_id', '')::uuid
         is distinct from submission_row.student_id
       or nullif(p_observation->>'activity_id', '')::uuid
         is distinct from submission_row.activity_id
       or nullif(p_observation->>'observer_id', '')::uuid
         is distinct from auth.uid()
       or jsonb_typeof(criteria_payload) <> 'array' then
      raise exception using
        errcode = '22023',
        message = 'Rubric evidence does not match this submission.';
    end if;

    if jsonb_typeof(activity_rubric_row.rubric_snapshot->'criteria') <> 'array' then
      raise exception using
        errcode = '22023',
        message = 'The attached rubric snapshot is invalid.';
    end if;

    expected_criterion_count := jsonb_array_length(
      activity_rubric_row.rubric_snapshot->'criteria'
    );

    if expected_criterion_count = 0
       or jsonb_array_length(criteria_payload) <> expected_criterion_count
       or exists (
         select 1
         from jsonb_array_elements(criteria_payload) criterion
         where coalesce(criterion->>'criterion_index', '') !~ '^[0-9]+$'
            or (criterion->>'criterion_index')::integer < 0
            or (criterion->>'criterion_index')::integer >= expected_criterion_count
            or upper(coalesce(criterion->>'selected_rating', ''))
                 not in ('B', 'D', 'C', 'NO', 'NA')
       )
       or (
         select count(distinct (criterion->>'criterion_index')::integer)
         from jsonb_array_elements(criteria_payload) criterion
       ) <> expected_criterion_count then
      raise exception using
        errcode = '22023',
        message = 'Select one valid rating for every rubric criterion.';
    end if;

    requested_ai_evaluation_id := nullif(
      p_observation->>'ai_evaluation_id',
      ''
    )::uuid;

    if requested_ai_evaluation_id is not null and not exists (
      select 1
      from public.submission_ai_evaluations evaluation
      where evaluation.id = requested_ai_evaluation_id
        and evaluation.submission_id = submission_row.id
        and evaluation.activity_id = submission_row.activity_id
        and evaluation.rubric_id = activity_rubric_row.rubric_id
        and evaluation.status = 'completed'
    ) then
      raise exception using
        errcode = '22023',
        message = 'The AI draft does not belong to this submission.';
    end if;

    insert into public.rubric_observations (
      rubric_id,
      rubric_version,
      class_id,
      learner_id,
      activity_id,
      activity_name,
      observer_id,
      observation_date,
      overall_comment,
      evidence_url,
      technical_conditions,
      technical_notes,
      next_steps,
      teacher_confirmed_at,
      ai_evaluation_id
    ) values (
      activity_rubric_row.rubric_id,
      activity_rubric_row.rubric_version,
      submission_row.assessment_class_id,
      submission_row.student_id,
      submission_row.activity_id,
      submission_row.assessment_activity_title,
      auth.uid(),
      coalesce(nullif(p_observation->>'observation_date', '')::date, current_date),
      nullif(coalesce(p_feedback, ''), ''),
      nullif(p_observation->>'evidence_url', ''),
      coalesce(p_observation->'technical_conditions', '[]'::jsonb),
      nullif(p_observation->>'technical_notes', ''),
      nullif(p_observation->>'next_steps', ''),
      now(),
      requested_ai_evaluation_id
    )
    returning id into observation_id;

    with snapshot_criteria as (
      select
        criterion,
        (ordinality - 1)::integer as criterion_index
      from jsonb_array_elements(
        activity_rubric_row.rubric_snapshot->'criteria'
      ) with ordinality as snapshot(criterion, ordinality)
    ), submitted_ratings as (
      select
        (rating->>'criterion_index')::integer as criterion_index,
        upper(rating->>'selected_rating') as selected_rating,
        nullif(rating->>'teacher_note', '') as teacher_note
      from jsonb_array_elements(criteria_payload) rating
    )
    insert into public.rubric_criterion_observations (
      observation_id,
      criterion_index,
      criterion_title_snapshot,
      beginning_descriptor_snapshot,
      developing_descriptor_snapshot,
      consistent_descriptor_snapshot,
      selected_rating,
      teacher_note
    )
    select
      observation_id,
      snapshot.criterion_index,
      coalesce(snapshot.criterion->>'name', 'Criterion ' || (snapshot.criterion_index + 1)),
      coalesce((
        select level->>'description'
        from jsonb_array_elements(
          case
            when jsonb_typeof(snapshot.criterion->'levels') = 'array'
              then snapshot.criterion->'levels'
            else '[]'::jsonb
          end
        ) level
        where upper(coalesce(level->>'code', '')) = 'B'
        limit 1
      ), ''),
      coalesce((
        select level->>'description'
        from jsonb_array_elements(
          case
            when jsonb_typeof(snapshot.criterion->'levels') = 'array'
              then snapshot.criterion->'levels'
            else '[]'::jsonb
          end
        ) level
        where upper(coalesce(level->>'code', '')) = 'D'
        limit 1
      ), ''),
      coalesce((
        select level->>'description'
        from jsonb_array_elements(
          case
            when jsonb_typeof(snapshot.criterion->'levels') = 'array'
              then snapshot.criterion->'levels'
            else '[]'::jsonb
          end
        ) level
        where upper(coalesce(level->>'code', '')) = 'C'
        limit 1
      ), ''),
      rating.selected_rating,
      rating.teacher_note
    from snapshot_criteria snapshot
    join submitted_ratings rating using (criterion_index)
    order by snapshot.criterion_index;
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

-- Browser clients read submissions directly, but all submission mutations are
-- now forced through the assignment-bound submit RPC and teacher-only finalize
-- RPC above. This prevents learners from forging score/review fields.
drop policy if exists "Students can submit submissions" on public.submissions;
drop policy if exists "Students can update own submissions" on public.submissions;
drop policy if exists "Students can insert assigned submissions" on public.submissions;
drop policy if exists "Students can update unreviewed submissions" on public.submissions;
drop policy if exists "Teachers can grade submissions" on public.submissions;

revoke all on table public.submissions from anon;
revoke insert, update, delete on table public.submissions from authenticated;
grant select on table public.submissions to authenticated;

create or replace function public.get_student_activity_assessment(
  p_activity_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  learner_id uuid := auth.uid();
  learner_role text := coalesce(public.elikha_current_role(), '');
  rubric_result jsonb;
  final_review_result jsonb;
  submission_row public.submissions;
  observation_row public.rubric_observations;
  criterion_results jsonb := '[]'::jsonb;
  approved_color_suggestion jsonb;
  attached_rubric_id uuid;
begin
  if learner_id is null or learner_role <> 'student' then
    raise exception using
      errcode = '42501',
      message = 'Only the assigned learner can view this assessment.';
  end if;

  if not exists (
    select 1
    from public.activity_assignments assignment
    join public.activities activity on activity.id = assignment.activity_id
    left join public.classes class_row on class_row.id = activity.class_id
    where assignment.activity_id = p_activity_id
      and assignment.student_id = learner_id
      and (activity.class_id is null or class_row.is_active is true)
  ) then
    raise exception using
      errcode = '42501',
      message = 'This activity is not assigned to the learner.';
  end if;

  select
    jsonb_build_object(
      'id', coalesce(assignment.rubric_snapshot->>'id', assignment.rubric_id::text),
      'title', coalesce(assignment.rubric_snapshot->>'title', 'Activity rubric'),
      'description', assignment.rubric_snapshot->>'description',
      'criteria', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'name', criterion->>'name',
            'levels', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'code', level->>'code',
                  'label', level->>'label',
                  'description', level->>'description'
                ) order by level_ordinality
              )
              from jsonb_array_elements(
                case
                  when jsonb_typeof(criterion->'levels') = 'array'
                    then criterion->'levels'
                  else '[]'::jsonb
                end
              ) with ordinality as level_row(level, level_ordinality)
            ), '[]'::jsonb)
          ) order by criterion_ordinality
        )
        from jsonb_array_elements(
          case
            when jsonb_typeof(assignment.rubric_snapshot->'criteria') = 'array'
              then assignment.rubric_snapshot->'criteria'
            else '[]'::jsonb
          end
        ) with ordinality as criterion_row(criterion, criterion_ordinality)
      ), '[]'::jsonb),
      'metadata', jsonb_build_object('version', assignment.rubric_version),
      'assignedVersion', assignment.rubric_version
    ),
    assignment.rubric_id
  into rubric_result, attached_rubric_id
  from public.activity_rubrics assignment
  where assignment.activity_id = p_activity_id
  order by assignment.assigned_at desc
  limit 1;

  select submission.*
  into submission_row
  from public.submissions submission
  where submission.activity_id = p_activity_id
    and submission.student_id = learner_id
  limit 1;

  if submission_row.id is not null
     and lower(coalesce(submission_row.status, '')) in ('reviewed', 'graded', 'completed')
     and submission_row.reviewed_at is not null
     and submission_row.reviewed_by is not null
     and submission_row.score between 1 and 5
     and exists (
       select 1
       from public.activities activity
       where activity.id = submission_row.activity_id
         and activity.teacher_id = submission_row.reviewed_by
     ) then
    select observation.*
    into observation_row
    from public.rubric_observations observation
    where observation.activity_id = p_activity_id
      and observation.learner_id = learner_id
      and observation.observer_id = submission_row.reviewed_by
      and observation.rubric_id = attached_rubric_id
      and observation.teacher_confirmed_at is not null
    order by observation.teacher_confirmed_at desc, observation.created_at desc
    limit 1;

    if observation_row.id is not null then
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'criterion_index', criterion.criterion_index,
          'criterion_title_snapshot', criterion.criterion_title_snapshot,
          'beginning_descriptor_snapshot', criterion.beginning_descriptor_snapshot,
          'developing_descriptor_snapshot', criterion.developing_descriptor_snapshot,
          'consistent_descriptor_snapshot', criterion.consistent_descriptor_snapshot,
          'selected_rating', criterion.selected_rating,
          'teacher_note', criterion.teacher_note
        ) order by criterion.criterion_index
      ), '[]'::jsonb)
      into criterion_results
      from public.rubric_criterion_observations criterion
      where criterion.observation_id = observation_row.id;

      if observation_row.ai_evaluation_id is not null then
        select jsonb_build_object(
          'message', evaluation.color_suggestion->>'message',
          'rationale', evaluation.color_suggestion->>'rationale',
          'colors', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'name', color->>'name',
                'hex', color->>'hex'
              ) order by color_ordinality
            )
            from jsonb_array_elements(
              case
                when jsonb_typeof(evaluation.color_suggestion->'colors') = 'array'
                  then evaluation.color_suggestion->'colors'
                else '[]'::jsonb
              end
            ) with ordinality as color_row(color, color_ordinality)
          ), '[]'::jsonb)
        )
        into approved_color_suggestion
        from public.submission_ai_evaluations evaluation
        where evaluation.id = observation_row.ai_evaluation_id
          and evaluation.submission_id = submission_row.id
          and evaluation.status = 'completed'
          and jsonb_typeof(evaluation.color_suggestion) = 'object';
      end if;
    end if;

    final_review_result := jsonb_build_object(
      'score', submission_row.score,
      'feedback', submission_row.feedback,
      'reviewed_at', submission_row.reviewed_at,
      'observation_date', observation_row.observation_date,
      'overall_comment', observation_row.overall_comment,
      'evidence_url', observation_row.evidence_url,
      'next_steps', observation_row.next_steps,
      'teacher_confirmed_at', observation_row.teacher_confirmed_at,
      'criteria', criterion_results,
      'approved_color_suggestion', approved_color_suggestion
    );
  end if;

  return jsonb_build_object(
    'rubric', rubric_result,
    'final_review', final_review_result
  );
end;
$$;

revoke all on function public.get_student_activity_assessment(uuid)
  from public, anon;
grant execute on function public.get_student_activity_assessment(uuid)
  to authenticated;

notify pgrst, 'reload schema';
