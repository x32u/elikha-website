create table if not exists public.user_settings (
  user_id uuid primary key references public.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

revoke all on table public.user_settings from public, anon, authenticated;
grant select on table public.user_settings to authenticated;
grant insert (user_id, settings, updated_at) on table public.user_settings to authenticated;
grant update (user_id, settings, updated_at) on table public.user_settings to authenticated;

drop policy if exists "Users can read own settings" on public.user_settings;
create policy "Users can read own settings"
on public.user_settings
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can insert own settings" on public.user_settings;
create policy "Users can insert own settings"
on public.user_settings
for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "Users can update own settings" on public.user_settings;
create policy "Users can update own settings"
on public.user_settings
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create schema if not exists private;

create or replace function private.elikha_touch_user_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.elikha_touch_user_settings() from public, anon, authenticated;

drop trigger if exists user_settings_touch_updated_at on public.user_settings;
create trigger user_settings_touch_updated_at
before update on public.user_settings
for each row execute function private.elikha_touch_user_settings();

create index if not exists user_settings_updated_at_idx
on public.user_settings (updated_at desc);
