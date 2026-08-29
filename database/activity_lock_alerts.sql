-- Activity-lock events recorded from student browser sessions.
-- Apply this file in the Supabase SQL editor before using Activity Lock alerts.
create table if not exists public.activity_lock_alerts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  event_type text not null check (event_type in ('student_unlocked', 'left_activity', 'fullscreen_exited')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_lock_alerts_activity_created_idx on public.activity_lock_alerts(activity_id, created_at desc);
alter table public.activity_lock_alerts enable row level security;

create policy "Students can report their activity lock events" on public.activity_lock_alerts
for insert to authenticated with check (auth.uid() = student_id and exists (
  select 1 from public.activity_assignments aa
  where aa.activity_id = activity_lock_alerts.activity_id and aa.student_id = activity_lock_alerts.student_id
));

create policy "Teachers can read activity lock alerts for their activities" on public.activity_lock_alerts
for select to authenticated using (exists (
  select 1 from public.activities a where a.id = activity_lock_alerts.activity_id and a.teacher_id = auth.uid()
));
