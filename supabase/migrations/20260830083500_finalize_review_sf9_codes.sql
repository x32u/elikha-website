-- Accept SF9 rating codes (BG/DV/CO) in the review finalizer, in addition to the
-- legacy single letters (B/D/C). Additive and backwards compatible: an old client
-- sending B/D/C still works; a new SF9 rubric sending BG/DV/CO now works too.
--
-- Only three things change from the previous definition, each marked -- CHANGED:
--   1. the criterion rating validation list,
--   2. the stored selected_rating is normalized to its SF9 code,
--   3. the descriptor snapshots are matched by either code form.
-- Everything else is the existing function, unchanged.

CREATE OR REPLACE FUNCTION public.finalize_submission_review(
  p_submission_id uuid,
  p_teacher_id uuid,
  p_score integer,
  p_feedback text DEFAULT ''::text,
  p_observation jsonb DEFAULT NULL::jsonb,
  p_criteria jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
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
            -- CHANGED: accept SF9 codes (CO/DV/BG) as well as legacy B/D/C.
            or upper(coalesce(criterion->>'selected_rating', ''))
                 not in ('CO', 'DV', 'BG', 'B', 'D', 'C', 'NO', 'NA')
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
        -- CHANGED: normalize the stored rating to its SF9 code.
        case upper(rating->>'selected_rating')
          when 'B' then 'BG'
          when 'D' then 'DV'
          when 'C' then 'CO'
          else upper(rating->>'selected_rating')
        end as selected_rating,
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
        -- CHANGED: match Beginning by either code form.
        where upper(coalesce(level->>'code', '')) in ('BG', 'B')
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
        -- CHANGED: match Developing by either code form.
        where upper(coalesce(level->>'code', '')) in ('DV', 'D')
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
        -- CHANGED: match Consistent by either code form.
        where upper(coalesce(level->>'code', '')) in ('CO', 'C')
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
$function$;
