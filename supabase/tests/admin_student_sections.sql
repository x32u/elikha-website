-- Run against a seeded environment. All test changes are rolled back.
begin;
do $$
declare
  actor uuid;
  learner uuid;
  memberships uuid[];
  target uuid;
begin
  select id into actor from public.users where role = 'superadmin' and is_active is not false limit 1;
  select id into learner from public.users where role = 'student' limit 1;
  if actor is null or learner is null then raise exception 'Test requires an administrator and student'; end if;
  select coalesce(array_agg(distinct class_id order by class_id), '{}'::uuid[]) into memberships from public.class_students where student_id = learner;
  perform set_config('request.jwt.claim.sub', learner::text, true);
  begin
    perform public.admin_set_student_classes(learner, memberships, memberships);
    raise exception 'Student permission unexpectedly accepted';
  exception when raise_exception then
    if sqlerrm <> 'Only active administrators can change student sections.' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', actor::text, true);
  perform public.admin_set_student_classes(learner, memberships, memberships);
  begin
    perform public.admin_set_student_classes(learner, array['00000000-0000-0000-0000-000000000000'::uuid], memberships);
    raise exception 'Invalid class unexpectedly accepted';
  exception when raise_exception then
    if sqlerrm <> 'Choose an available class.' then raise; end if;
  end;
  select id into target from public.classes where is_active is not false limit 1;
  if target is not null then
    perform public.admin_set_student_classes(learner, array[target], memberships);
    if (select count(*) from public.class_students where student_id = learner) <> 1 then raise exception 'Membership was not replaced'; end if;
    if not exists (select 1 from public.class_students where student_id = learner and class_id = target) then raise exception 'Target membership missing'; end if;
    perform public.admin_set_student_classes(learner, '{}'::uuid[], array[target]);
    if exists (select 1 from public.class_students where student_id = learner) then raise exception 'Clear membership failed'; end if;
  end if;
end;
$$;
rollback;
