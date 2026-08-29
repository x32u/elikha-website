-- Gemini-assisted AR submission grading.
-- AI suggestions are intentionally stored separately from the teacher's final
-- score so students cannot read draft evaluations and teachers remain in control.

create table if not exists public.submission_ai_evaluations (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.submissions(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  rubric_id uuid not null references public.rubrics(id) on delete restrict,
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  suggested_score smallint
    check (suggested_score between 1 and 5),
  rubric_score numeric,
  rubric_max_score numeric,
  criterion_scores jsonb not null default '[]'::jsonb,
  summary text,
  feedback text,
  teacher_note text,
  color_suggestion jsonb,
  model text,
  error text,
  submission_submitted_at timestamptz,
  rubric_updated_at timestamptz,
  evaluated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.submission_ai_evaluations
  add column if not exists color_suggestion jsonb;

create index if not exists submission_ai_evaluations_activity_id_idx
  on public.submission_ai_evaluations(activity_id);
create index if not exists submission_ai_evaluations_rubric_id_idx
  on public.submission_ai_evaluations(rubric_id);

alter table public.submission_ai_evaluations enable row level security;

revoke all on table public.submission_ai_evaluations from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.submission_ai_evaluations from authenticated;
grant select on table public.submission_ai_evaluations to authenticated;

drop policy if exists "Teachers read AI evaluations for own activities"
  on public.submission_ai_evaluations;
drop policy if exists "Administrators read AI evaluations"
  on public.submission_ai_evaluations;
drop policy if exists "Teachers and administrators read AI evaluations"
  on public.submission_ai_evaluations;
create policy "Teachers and administrators read AI evaluations"
  on public.submission_ai_evaluations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.activities activity
      where activity.id = submission_ai_evaluations.activity_id
        and activity.teacher_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.users account
      where account.id = (select auth.uid())
        and lower(account.role) in ('admin', 'superadmin')
    )
  );

-- No client insert/update/delete policy is created. The Edge Function writes
-- with the service-role key after verifying the authenticated caller.
