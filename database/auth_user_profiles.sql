-- Keeps Supabase Auth accounts synced with public.users.
-- Apply this in Supabase SQL Editor so accounts created by the admin/superadmin
-- panel always have the profile row that the app uses for roles.

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

drop trigger if exists on_auth_user_created_sync_public_profile
  on auth.users;

create trigger on_auth_user_created_sync_public_profile
after insert on auth.users
for each row
execute function public.sync_auth_user_profile();

insert into public.users (id, email, name, role)
select
  auth_user.id,
  lower(auth_user.email),
  coalesce(
    nullif(trim(coalesce(auth_user.raw_user_meta_data->>'name', '')), ''),
    split_part(auth_user.email, '@', 1),
    'User'
  ) as name,
  case
    when replace(replace(replace(lower(coalesce(auth_user.raw_user_meta_data->>'role', 'student')), '_', ''), '-', ''), ' ', '')
      in ('student', 'teacher', 'admin', 'superadmin', 'parent')
    then replace(replace(replace(lower(coalesce(auth_user.raw_user_meta_data->>'role', 'student')), '_', ''), '-', ''), ' ', '')
    else 'student'
  end as role
from auth.users auth_user
where auth_user.email is not null
on conflict (id) do update
  set email = excluded.email,
      name = coalesce(nullif(public.users.name, ''), excluded.name),
      role = coalesce(nullif(public.users.role, ''), excluded.role);
