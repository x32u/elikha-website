-- Fix a PL/pgSQL name collision that prevented assigned learners from loading
-- their rubric and teacher-confirmed assessment. The previous implementation
-- used learner_id as both a local variable and a rubric_observations column.

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
  current_learner_id uuid := auth.uid();
  learner_role text := coalesce(public.elikha_current_role(), '');
  rubric_result jsonb;
  final_review_result jsonb;
  submission_row public.submissions;
  observation_row public.rubric_observations;
  criterion_results jsonb := '[]'::jsonb;
  approved_color_suggestion jsonb;
  attached_rubric_id uuid;
begin
  if current_learner_id is null or learner_role <> 'student' then
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
      and assignment.student_id = current_learner_id
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
    and submission.student_id = current_learner_id
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
      and observation.learner_id = current_learner_id
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
