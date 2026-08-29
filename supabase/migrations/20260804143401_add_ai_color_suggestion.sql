alter table public.submission_ai_evaluations
  add column if not exists color_suggestion jsonb;

comment on column public.submission_ai_evaluations.color_suggestion is
  'Child-friendly, rubric-aware color guidance generated with the draft AI evaluation.';
