-- A disabled class keeps its enrollment, activities, submissions, and reports
-- for restoration and historical review, but it must not remain launchable by
-- learners or editable by its former classroom teacher.

create or replace function private.elikha_student_has_activity(p_activity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.activity_assignments assignment
    join public.activities activity on activity.id = assignment.activity_id
    left join public.classes class_row on class_row.id = activity.class_id
    where assignment.activity_id = p_activity_id
      and assignment.student_id = (select auth.uid())
      and (activity.class_id is null or class_row.is_active is true)
  );
$$;

revoke all on function private.elikha_student_has_activity(uuid)
  from public, anon, authenticated;
grant execute on function private.elikha_student_has_activity(uuid)
  to authenticated;

drop policy if exists "Teachers can update own classes" on public.classes;
create policy "Teachers can update own classes"
on public.classes for update to authenticated
using (
  teacher_id = (select auth.uid())
  and public.elikha_current_role() = 'teacher'
  and is_active is true
)
with check (
  teacher_id = (select auth.uid())
  and public.elikha_current_role() = 'teacher'
);
