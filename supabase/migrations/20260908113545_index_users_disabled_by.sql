create index if not exists users_disabled_by_idx
  on public.users (disabled_by)
  where disabled_by is not null;
