-- Teacher-created rubrics and their activity assignments.
create table if not exists public.rubrics (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  description text,
  criteria jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_rubrics (
  activity_id uuid primary key references public.activities(id) on delete cascade,
  rubric_id uuid not null references public.rubrics(id) on delete restrict,
  assigned_at timestamptz not null default now()
);

create index if not exists rubrics_teacher_id_idx
  on public.rubrics(teacher_id);
create index if not exists activity_rubrics_rubric_id_idx
  on public.activity_rubrics(rubric_id);

alter table public.rubrics enable row level security;
alter table public.activity_rubrics enable row level security;

revoke all on table public.rubrics, public.activity_rubrics
  from anon, authenticated, service_role;
grant select, insert, update, delete
  on table public.rubrics, public.activity_rubrics
  to authenticated, service_role;

drop policy if exists "Teachers manage own rubrics" on public.rubrics;
create policy "Teachers manage own rubrics" on public.rubrics
  for all
  to authenticated
  using (teacher_id = (select auth.uid()))
  with check (teacher_id = (select auth.uid()));

drop policy if exists "Teachers manage rubrics on own activities" on public.activity_rubrics;
create policy "Teachers manage rubrics on own activities" on public.activity_rubrics
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.activities activity
      where activity.id = activity_rubrics.activity_id
        and activity.teacher_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.activities activity
      where activity.id = activity_rubrics.activity_id
        and activity.teacher_id = (select auth.uid())
    )
  );
