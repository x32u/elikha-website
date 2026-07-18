-- Parent accounts and parent-to-student linking for e-Likha.
-- Super Admin owns linking. Parents can only read their own linked students/data.

alter table public.users drop constraint if exists users_role_check;
alter table public.users
  add constraint users_role_check
  check (role = any (array['student', 'teacher', 'admin', 'superadmin', 'parent']::text[]));

create or replace function public.sync_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_role text;
  safe_name text;
begin
  safe_role := replace(replace(replace(lower(coalesce(new.raw_user_meta_data->>'role', 'student')), '_', ''), '-', ''), ' ', '');

  if safe_role not in ('student', 'teacher', 'admin', 'superadmin', 'parent') then
    safe_role := 'student';
  end if;

  safe_name := nullif(trim(coalesce(new.raw_user_meta_data->>'name', '')), '');

  insert into public.users (id, email, name, role)
  values (
    new.id,
    lower(new.email),
    coalesce(safe_name, split_part(new.email, '@', 1), 'User'),
    safe_role
  )
  on conflict (id) do update
    set email = excluded.email,
        name = coalesce(nullif(public.users.name, ''), excluded.name),
        role = coalesce(nullif(public.users.role, ''), excluded.role);

  return new;
end;
$$;

create table if not exists public.parent_students (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.users(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  linked_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists parent_students_parent_student_idx
  on public.parent_students(parent_id, student_id);

create index if not exists parent_students_parent_idx
  on public.parent_students(parent_id);

create index if not exists parent_students_student_idx
  on public.parent_students(student_id);

create or replace function public.validate_parent_student_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.users u
    where u.id = new.parent_id
      and replace(replace(replace(lower(coalesce(u.role, '')), '_', ''), '-', ''), ' ', '') = 'parent'
  ) then
    raise exception 'Parent account not found.';
  end if;

  if not exists (
    select 1
    from public.users u
    where u.id = new.student_id
      and replace(replace(replace(lower(coalesce(u.role, '')), '_', ''), '-', ''), ' ', '') = 'student'
  ) then
    raise exception 'Student account not found.';
  end if;

  return new;
end;
$$;

drop trigger if exists parent_students_validate_roles on public.parent_students;
create trigger parent_students_validate_roles
before insert or update on public.parent_students
for each row
execute function public.validate_parent_student_link();

create or replace function public.elikha_is_parent_of(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.parent_students ps
    where ps.parent_id = auth.uid()
      and ps.student_id = p_student_id
  );
$$;

revoke all on function public.elikha_is_parent_of(uuid) from public;
grant execute on function public.elikha_is_parent_of(uuid) to authenticated;

create or replace function public.elikha_parent_has_activity(p_activity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.parent_students ps
    join public.activity_assignments aa
      on aa.student_id = ps.student_id
    where ps.parent_id = auth.uid()
      and aa.activity_id = p_activity_id
  );
$$;

revoke all on function public.elikha_parent_has_activity(uuid) from public;
grant execute on function public.elikha_parent_has_activity(uuid) to authenticated;

create or replace function public.elikha_parent_has_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.parent_students ps
    join public.class_students cs
      on cs.student_id = ps.student_id
    where ps.parent_id = auth.uid()
      and cs.class_id = p_class_id
  );
$$;

revoke all on function public.elikha_parent_has_class(uuid) from public;
grant execute on function public.elikha_parent_has_class(uuid) to authenticated;

alter table public.parent_students enable row level security;

drop policy if exists "Super admins can manage parent student links" on public.parent_students;
create policy "Super admins can manage parent student links"
on public.parent_students
for all
to authenticated
using (public.elikha_current_role() = 'superadmin')
with check (public.elikha_current_role() = 'superadmin');

drop policy if exists "Parents can read own student links" on public.parent_students;
create policy "Parents can read own student links"
on public.parent_students
for select
to authenticated
using (parent_id = auth.uid());

drop policy if exists "Parents can view linked students" on public.users;
create policy "Parents can view linked students"
on public.users
for select
to authenticated
using (public.elikha_is_parent_of(id));

drop policy if exists "Parents can read linked student enrollments" on public.class_students;
create policy "Parents can read linked student enrollments"
on public.class_students
for select
to authenticated
using (public.elikha_is_parent_of(student_id));

drop policy if exists "Parents can read linked student classes" on public.classes;
create policy "Parents can read linked student classes"
on public.classes
for select
to authenticated
using (public.elikha_parent_has_class(id));

drop policy if exists "Parents can read linked activity assignments" on public.activity_assignments;
create policy "Parents can read linked activity assignments"
on public.activity_assignments
for select
to authenticated
using (public.elikha_is_parent_of(student_id));

drop policy if exists "Parents can read linked activities" on public.activities;
create policy "Parents can read linked activities"
on public.activities
for select
to authenticated
using (public.elikha_parent_has_activity(id));

drop policy if exists "Parents can view linked student submissions" on public.submissions;
create policy "Parents can view linked student submissions"
on public.submissions
for select
to authenticated
using (public.elikha_is_parent_of(student_id));

drop policy if exists "Parents can view linked student artworks" on public.artworks;
create policy "Parents can view linked student artworks"
on public.artworks
for select
to authenticated
using (public.elikha_is_parent_of(student_id));
