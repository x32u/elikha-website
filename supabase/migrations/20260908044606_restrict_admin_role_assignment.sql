-- Regular administrators may manage learner, parent, and teacher profiles, but
-- only a super administrator may create, promote, demote, or edit another
-- administrator account. Administrators may still update their own non-role
-- profile fields (for example, their display name).
create or replace function private.elikha_guard_user_sensitive_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_role text := lower(coalesce(public.elikha_current_role(), ''));
  old_role text := lower(coalesce(old.role, ''));
  new_role text := lower(coalesce(new.role, ''));
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
    (auth.uid() is distinct from old.id and old_role in ('admin', 'superadmin'))
    or (new.role is distinct from old.role and new_role in ('admin', 'superadmin'))
  ) then
    raise exception using
      errcode = '42501',
      message = 'Only a super administrator can assign or manage administrator roles.';
  end if;

  return new;
end;
$$;

revoke all on function private.elikha_guard_user_sensitive_fields()
  from public, anon, authenticated;
