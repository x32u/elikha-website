alter table public.users
  add column if not exists is_active boolean not null default true,
  add column if not exists disabled_at timestamp with time zone,
  add column if not exists disabled_by uuid references public.users(id) on delete set null;

comment on column public.users.is_active is
  'False when a super administrator has disabled this account. Profile and related records remain stored.';
comment on column public.users.disabled_at is
  'Timestamp of the most recent account deactivation.';
comment on column public.users.disabled_by is
  'Super administrator who most recently disabled the account.';

create index if not exists users_inactive_idx
  on public.users (disabled_at desc)
  where is_active is false;

create or replace function public.protect_user_account_status()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  actor_active boolean;
  remaining_superadmins integer;
begin
  if new.is_active is not distinct from old.is_active
     and new.disabled_at is not distinct from old.disabled_at
     and new.disabled_by is not distinct from old.disabled_by
     and not (old.role = 'superadmin' and new.role is distinct from old.role) then
    return new;
  end if;

  if actor_id is not null then
    select lower(coalesce(role, '')), is_active
      into actor_role, actor_active
      from public.users
      where id = actor_id;

    if actor_role is distinct from 'superadmin' or actor_active is not true then
      raise exception using
        errcode = '42501',
        message = 'Only an active super administrator may change account status.';
    end if;
  end if;

  if new.is_active is false and coalesce(new.disabled_by, actor_id) = new.id then
    raise exception using
      errcode = '23514',
      message = 'You cannot deactivate your own account.';
  end if;

  if lower(coalesce(old.role, '')) = 'superadmin'
     and (new.is_active is false or lower(coalesce(new.role, '')) <> 'superadmin') then
    select count(*)::integer
      into remaining_superadmins
      from public.users
      where id <> old.id
        and lower(coalesce(role, '')) = 'superadmin'
        and is_active is true;

    if remaining_superadmins < 1 then
      raise exception using
        errcode = '23514',
        message = 'The final active super administrator cannot be deactivated or demoted.';
    end if;
  end if;

  if new.is_active is false then
    new.disabled_at := coalesce(new.disabled_at, now());
    new.disabled_by := coalesce(new.disabled_by, actor_id);
  else
    new.disabled_at := null;
    new.disabled_by := null;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_user_account_status_trigger on public.users;
create trigger protect_user_account_status_trigger
before update of is_active, disabled_at, disabled_by, role
on public.users
for each row execute function public.protect_user_account_status();
