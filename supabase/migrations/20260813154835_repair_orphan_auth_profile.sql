-- Restore the E-Likha profile for the confirmed Auth account reported through
-- User Management. The Auth UUID and password are deliberately preserved.
insert into public.users (id, email, name, role)
select
  auth_user.id,
  lower(trim(auth_user.email)),
  left(
    coalesce(
      nullif(trim(coalesce(auth_user.raw_user_meta_data ->> 'name', '')), ''),
      nullif(split_part(lower(trim(auth_user.email)), '@', 1), ''),
      'User'
    ),
    120
  ),
  'student'
from auth.users as auth_user
where lower(trim(auth_user.email)) = 'jcxxme@gmail.com'
  and auth_user.email_confirmed_at is not null
  and auth_user.deleted_at is null
  and coalesce(auth_user.is_anonymous, false) = false
  and (auth_user.banned_until is null or auth_user.banned_until <= now())
  and not exists (
    select 1
    from public.users as profile
    where profile.id = auth_user.id
       or lower(trim(profile.email)) = lower(trim(auth_user.email))
  )
on conflict do nothing;

-- User Management visually hides the Super Admin role from administrators,
-- but RLS must enforce that boundary too. Service-role calls from the protected
-- Edge Function have no auth.uid() and remain able to provision accounts.
create or replace function private.elikha_guard_user_sensitive_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_role text := coalesce(public.elikha_current_role(), '');
begin
  if auth.uid() is not null and new.id is distinct from old.id then
    raise exception using
      errcode = '42501',
      message = 'Account identifiers cannot be changed from the profile table.';
  end if;

  if auth.uid() is not null
     and new.email is distinct from old.email
     and actor_role <> 'superadmin' then
    raise exception using
      errcode = '42501',
      message = 'Only a super administrator can synchronize account email changes.';
  end if;

  if auth.uid() = old.id and new.role is distinct from old.role then
    raise exception using
      errcode = '42501',
      message = 'Users cannot change their own role.';
  end if;

  if actor_role = 'admin' and (
    lower(coalesce(old.role, '')) = 'superadmin'
    or lower(coalesce(new.role, '')) = 'superadmin'
  ) then
    raise exception using
      errcode = '42501',
      message = 'Only a super administrator can manage super administrator accounts.';
  end if;

  return new;
end;
$$;

revoke all on function private.elikha_guard_user_sensitive_fields()
  from public, anon, authenticated;

drop trigger if exists users_guard_sensitive_fields on public.users;
create trigger users_guard_sensitive_fields
before update on public.users
for each row execute function private.elikha_guard_user_sensitive_fields();
