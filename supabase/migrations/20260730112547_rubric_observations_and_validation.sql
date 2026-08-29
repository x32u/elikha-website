alter table public.rubrics
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.rubric_observations (
  id uuid primary key default gen_random_uuid(),
  rubric_id uuid not null references public.rubrics(id) on delete restrict,
  rubric_version text not null,
  class_id uuid references public.classes(id) on delete set null,
  learner_id uuid not null references public.users(id) on delete cascade,
  activity_id uuid references public.activities(id) on delete set null,
  activity_name text,
  observer_id uuid not null references public.users(id) on delete restrict,
  observation_date date not null default current_date,
  overall_comment text,
  evidence_url text,
  technical_conditions jsonb not null default '[]'::jsonb,
  technical_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rubric_criterion_observations (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references public.rubric_observations(id) on delete cascade,
  criterion_index integer not null check (criterion_index >= 0),
  criterion_title_snapshot text not null,
  beginning_descriptor_snapshot text not null,
  developing_descriptor_snapshot text not null,
  consistent_descriptor_snapshot text not null,
  selected_rating text not null check (selected_rating in ('B', 'D', 'C', 'NO', 'NA')),
  teacher_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (observation_id, criterion_index)
);

create index if not exists rubric_observations_learner_idx
  on public.rubric_observations(learner_id, observation_date desc);

create index if not exists rubric_observations_rubric_idx
  on public.rubric_observations(rubric_id);

alter table public.rubric_observations enable row level security;
alter table public.rubric_criterion_observations enable row level security;

revoke all on table
  public.rubrics,
  public.activity_rubrics,
  public.rubric_observations,
  public.rubric_criterion_observations
from anon, authenticated, service_role;

grant select, insert, update, delete
  on table
    public.rubrics,
    public.activity_rubrics,
    public.rubric_observations,
    public.rubric_criterion_observations
  to authenticated, service_role;

create or replace function public.is_rubric_admin()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = (select auth.uid())
      and lower(replace(replace(role::text, ' ', ''), '-', '')) in ('admin', 'superadmin')
  )
$$;

revoke execute on function public.is_rubric_admin() from public, anon;
grant execute on function public.is_rubric_admin() to authenticated, service_role;

drop policy if exists "Teachers manage authorized observations" on public.rubric_observations;
create policy "Teachers manage authorized observations"
on public.rubric_observations
for all
to authenticated
using (
  public.is_rubric_admin()
  or (
    observer_id = (select auth.uid())
    and exists (
      select 1
      from public.rubrics rubric
      where rubric.id = rubric_observations.rubric_id
        and rubric.teacher_id = (select auth.uid())
    )
    and (
      rubric_observations.activity_id is null
      or exists (
        select 1
        from public.activities activity
        join public.submissions submission
          on submission.activity_id = activity.id
         and submission.student_id = rubric_observations.learner_id
        where activity.id = rubric_observations.activity_id
          and activity.teacher_id = (select auth.uid())
      )
    )
  )
)
with check (
  public.is_rubric_admin()
  or (
    observer_id = (select auth.uid())
    and exists (
      select 1
      from public.rubrics rubric
      where rubric.id = rubric_observations.rubric_id
        and rubric.teacher_id = (select auth.uid())
    )
    and (
      rubric_observations.activity_id is null
      or exists (
        select 1
        from public.activities activity
        join public.submissions submission
          on submission.activity_id = activity.id
         and submission.student_id = rubric_observations.learner_id
        where activity.id = rubric_observations.activity_id
          and activity.teacher_id = (select auth.uid())
      )
    )
  )
);

drop policy if exists "Teachers manage observation criteria" on public.rubric_criterion_observations;
create policy "Teachers manage observation criteria"
on public.rubric_criterion_observations
for all
to authenticated
using (
  exists (
    select 1
    from public.rubric_observations observation
    where observation.id = rubric_criterion_observations.observation_id
  )
)
with check (
  exists (
    select 1
    from public.rubric_observations observation
    where observation.id = rubric_criterion_observations.observation_id
  )
);
