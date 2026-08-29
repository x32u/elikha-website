-- Let an authenticated learner read only active classes in which they have an
-- enrollment row. The helper bypasses class_students RLS to avoid recursive
-- classes <-> class_students policy evaluation, while always binding the
-- lookup to the caller's auth.uid(). Keep it outside the exposed public schema.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.elikha_student_has_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.class_students cs
    where cs.class_id = p_class_id
      and cs.student_id = (select auth.uid())
  );
$$;

revoke all on function private.elikha_student_has_class(uuid) from public, anon;
grant execute on function private.elikha_student_has_class(uuid) to authenticated, service_role;

drop policy if exists "Students can read enrolled active classes" on public.classes;
create policy "Students can read enrolled active classes"
on public.classes
for select
to authenticated
using (
  is_active is true
  and private.elikha_student_has_class(id)
);
