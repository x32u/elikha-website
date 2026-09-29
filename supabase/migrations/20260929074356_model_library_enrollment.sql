-- Read-only, caller-scoped class membership for the private R2 model service.
-- Do not accept a user ID argument: the JWT defines whose enrollment is read.
create or replace function public.model_library_classes()
returns table(class_id uuid, class_name text, teacher_id uuid)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.name, c.teacher_id
  from public.class_students cs
  join public.classes c on c.id = cs.class_id
  join public.users u on u.id = cs.student_id
  join public.users t on t.id = c.teacher_id
  where cs.student_id = auth.uid()
    and lower(u.role) = 'student' and u.is_active is not false
    and lower(t.role) = 'teacher' and t.is_active is not false
    and c.is_active is not false;
$$;
revoke all on function public.model_library_classes() from public, anon;
grant execute on function public.model_library_classes() to authenticated;

-- Enrollment controls the Sandbox. Previously assigned/submitted work retains
-- access to its specific referenced assets even after enrollment changes.
drop function if exists public.can_read_activity_model(text);
create or replace function public.can_read_activity_model(model_id text, model_owner uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null
    and model_id ~ '^[a-zA-Z0-9-]{1,160}$'
    and exists (select 1 from public.users u where u.id = auth.uid() and u.is_active is not false)
    and (
      exists (
        select 1 from public.activities a
        where strpos(a.description, '/models/files/' || model_id || '?') > 0
          and (model_owner is null or a.teacher_id = model_owner)
          and (a.teacher_id = auth.uid() or exists (
            select 1 from public.activity_assignments aa
            where aa.activity_id = a.id and aa.student_id = auth.uid()
          ) or exists (
            select 1 from public.submissions s
            where s.activity_id = a.id and s.student_id = auth.uid()
          ))
      )
    );
$$;
revoke all on function public.can_read_activity_model(text, uuid) from public, anon;
grant execute on function public.can_read_activity_model(text, uuid) to authenticated;
