-- Retain class history while allowing teachers and administrators to take a
-- class out of active use. Physical deletion is deliberately blocked.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.classes
  add column if not exists is_active boolean not null default true,
  add column if not exists disabled_at timestamp with time zone,
  add column if not exists disabled_by uuid references public.users(id) on delete set null;

comment on column public.classes.is_active is
  'False when the class is disabled. The class and all related records remain stored.';
comment on column public.classes.disabled_at is
  'Timestamp of the most recent transition to inactive.';
comment on column public.classes.disabled_by is
  'User who most recently disabled the class, when available.';

create index if not exists classes_teacher_active_idx
  on public.classes (teacher_id, created_at desc)
  where is_active = true;

create index if not exists classes_disabled_by_idx
  on public.classes (disabled_by)
  where disabled_by is not null;

create or replace function private.elikha_normalize_class_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.is_active then
    new.disabled_at := null;
    new.disabled_by := null;
  elsif tg_op = 'INSERT' then
    new.disabled_at := now();
    new.disabled_by := auth.uid();
  elsif old.is_active is distinct from false then
    new.disabled_at := now();
    new.disabled_by := auth.uid();
  else
    new.disabled_at := coalesce(new.disabled_at, old.disabled_at, now());
    new.disabled_by := coalesce(new.disabled_by, old.disabled_by, auth.uid());
  end if;

  return new;
end;
$$;

create or replace function private.elikha_prevent_class_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'Classes cannot be permanently deleted.',
    hint = 'Set is_active to false instead.';
end;
$$;

revoke all on function private.elikha_normalize_class_lifecycle() from public, anon, authenticated;
revoke all on function private.elikha_prevent_class_delete() from public, anon, authenticated;

drop trigger if exists classes_normalize_lifecycle on public.classes;
create trigger classes_normalize_lifecycle
before insert or update of is_active, disabled_at, disabled_by
on public.classes
for each row execute function private.elikha_normalize_class_lifecycle();

drop trigger if exists classes_prevent_delete on public.classes;
create trigger classes_prevent_delete
before delete on public.classes
for each row execute function private.elikha_prevent_class_delete();

drop policy if exists "Teachers can delete assigned empty classes" on public.classes;
revoke delete on table public.classes from anon, authenticated;
