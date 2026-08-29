-- Freeze the rubric used by an activity so later edits cannot alter past reviews.
alter table public.activity_rubrics
  add column if not exists rubric_snapshot jsonb,
  add column if not exists rubric_version text;

update public.activity_rubrics assignment
set rubric_snapshot = jsonb_build_object(
      'id', rubric.id,
      'title', rubric.title,
      'description', rubric.description,
      'criteria', rubric.criteria,
      'metadata', rubric.metadata,
      'updated_at', rubric.updated_at
    ),
    rubric_version = coalesce(rubric.metadata->>'version', '1')
from public.rubrics rubric
where rubric.id = assignment.rubric_id
  and assignment.rubric_snapshot is null;

alter table public.activity_rubrics
  alter column rubric_snapshot set not null,
  alter column rubric_version set not null;

alter table public.rubric_observations
  add column if not exists next_steps text,
  add column if not exists teacher_confirmed_at timestamptz,
  add column if not exists ai_evaluation_id uuid;

create index if not exists rubric_observations_activity_idx
  on public.rubric_observations(activity_id, learner_id, observation_date desc);
