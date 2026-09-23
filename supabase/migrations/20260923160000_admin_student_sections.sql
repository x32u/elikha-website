-- Change memberships atomically; retain all historical assignments and work.
create or replace function public.admin_set_student_classes(
  p_student_id uuid, p_class_ids uuid[], p_expected_class_ids uuid[]
) returns void language plpgsql security definer set search_path = '' as $$
declare
  student public.users%rowtype;
  previous_ids uuid[];
  selected_ids uuid[];
begin
  if not exists (select 1 from public.users where id = auth.uid()
    and role in ('admin', 'superadmin') and is_active is not false) then
    raise exception 'Only active administrators can change student sections.';
  end if;
  select * into student from public.users where id = p_student_id for update;
  if not found or student.role <> 'student' then
    raise exception 'Select an existing student account.';
  end if;
  select coalesce(array_agg(distinct class_id order by class_id), '{}'::uuid[])
    into previous_ids from public.class_students where student_id = p_student_id;
  if previous_ids is distinct from array(select distinct unnest(coalesce(p_expected_class_ids, '{}'::uuid[])) order by 1) then
    raise exception 'This student’s sections changed. Reload User Management and try again.';
  end if;
  selected_ids := array(select distinct unnest(coalesce(p_class_ids, '{}'::uuid[])) order by 1);
  if exists (select 1 from unnest(selected_ids) as chosen(class_id) where chosen.class_id is null or not exists
    (select 1 from public.classes c where c.id = chosen.class_id and (c.is_active is not false or c.id = any(previous_ids)))) then
    raise exception 'Choose an available class.';
  end if;
  -- Lock class totals in a stable order for concurrent administrator edits.
  perform id from public.classes where id = any(previous_ids || selected_ids) order by id for update;
  delete from public.class_students where student_id = p_student_id and not (class_id = any(selected_ids));
  insert into public.class_students(class_id, student_id, student_name, student_email)
    select chosen.class_id, student.id, student.name, student.email from unnest(selected_ids) as chosen(class_id)
    where not exists (select 1 from public.class_students cs where cs.class_id = chosen.class_id and cs.student_id = student.id);
  insert into public.activity_assignments(activity_id, student_id, status)
    select a.id, student.id, 'pending' from public.activities a
    where a.class_id = any(selected_ids) and a.status = 'active'
    and not exists (select 1 from public.activity_assignments aa where aa.activity_id = a.id and aa.student_id = student.id)
    on conflict do nothing;
  update public.classes c set student_count = (select count(*) from public.class_students cs where cs.class_id = c.id)
    where c.id = any(previous_ids || selected_ids);
end;
$$;
revoke all on function public.admin_set_student_classes(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.admin_set_student_classes(uuid, uuid[], uuid[]) to authenticated;
