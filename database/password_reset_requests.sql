-- Password reset approvals for e-Likha.
-- Apply this once in Supabase SQL Editor before using the Forgot Password approval flow.

create table if not exists public.password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  user_agent text,
  rejection_reason text,
  requested_at timestamptz not null default now(),
  reset_sent_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint password_reset_requests_email_format
    check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

create index if not exists password_reset_requests_status_idx
  on public.password_reset_requests(status, created_at desc);

create index if not exists password_reset_requests_email_idx
  on public.password_reset_requests(lower(email), created_at desc);

create or replace function public.set_password_reset_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists password_reset_requests_set_updated_at
  on public.password_reset_requests;

create trigger password_reset_requests_set_updated_at
before update on public.password_reset_requests
for each row
execute function public.set_password_reset_requests_updated_at();

alter table public.password_reset_requests enable row level security;

drop policy if exists "Anyone can request password reset approval"
  on public.password_reset_requests;

create policy "Anyone can request password reset approval"
on public.password_reset_requests
for insert
to anon, authenticated
with check (
  status = 'pending'
  and reviewed_at is null
  and reviewed_by is null
  and reset_sent_at is null
);

drop policy if exists "Super admins can read password reset approvals"
  on public.password_reset_requests;

create policy "Super admins can read password reset approvals"
on public.password_reset_requests
for select
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and lower(replace(replace(coalesce(u.role, ''), '_', ''), '-', '')) = 'superadmin'
  )
);

drop policy if exists "Super admins can update password reset approvals"
  on public.password_reset_requests;

create policy "Super admins can update password reset approvals"
on public.password_reset_requests
for update
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and lower(replace(replace(coalesce(u.role, ''), '_', ''), '-', '')) = 'superadmin'
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and lower(replace(replace(coalesce(u.role, ''), '_', ''), '-', '')) = 'superadmin'
  )
);

create or replace function public.get_password_reset_approval_requests()
returns table (
  id uuid,
  email text,
  status text,
  user_agent text,
  rejection_reason text,
  requested_at timestamptz,
  reset_sent_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  account_id uuid,
  account_name text,
  account_role text,
  is_reset_allowed boolean
)
language sql
security definer
set search_path = public
as $$
  select
    request.id,
    request.email,
    request.status,
    request.user_agent,
    request.rejection_reason,
    request.requested_at,
    request.reset_sent_at,
    request.reviewed_at,
    request.reviewed_by,
    request.created_at,
    request.updated_at,
    account.id as account_id,
    coalesce(account.name, 'Unknown account') as account_name,
    coalesce(account.role, 'unknown') as account_role,
    replace(replace(replace(lower(coalesce(account.role, '')), '_', ''), '-', ''), ' ', '') in ('student', 'teacher') as is_reset_allowed
  from public.password_reset_requests request
  left join public.users account
    on lower(trim(account.email)) = lower(trim(request.email))
  where exists (
    select 1
    from public.users current_user_profile
    where current_user_profile.id = auth.uid()
      and replace(replace(replace(lower(coalesce(current_user_profile.role, '')), '_', ''), '-', ''), ' ', '') = 'superadmin'
  )
  order by request.created_at desc;
$$;

revoke all on function public.get_password_reset_approval_requests() from public;
grant execute on function public.get_password_reset_approval_requests() to authenticated;

create or replace function public.create_password_reset_approval_request(
  p_email text,
  p_user_agent text default null
)
returns table (
  success boolean,
  code text,
  message text,
  request_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_email text;
  normalized_role text;
  matched_user_id uuid;
  existing_request_id uuid;
  created_request_id uuid;
begin
  safe_email := lower(trim(coalesce(p_email, '')));

  if safe_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return query select
      false,
      'invalid_email',
      'Enter a valid email address.',
      null::uuid;
    return;
  end if;

  select
    users.id,
    replace(replace(replace(lower(coalesce(users.role, '')), '_', ''), '-', ''), ' ', '')
  into matched_user_id, normalized_role
  from public.users
  where lower(trim(users.email)) = safe_email
  limit 1;

  if matched_user_id is null then
    return query select
      false,
      'account_not_found',
      'No student or teacher account matches this email. Check the spelling or contact your teacher.',
      null::uuid;
    return;
  end if;

  if normalized_role not in ('student', 'teacher') then
    return query select
      false,
      'role_not_allowed',
      'Only student and teacher accounts can request a password reset here.',
      null::uuid;
    return;
  end if;

  select request.id
  into existing_request_id
  from public.password_reset_requests request
  where lower(trim(request.email)) = safe_email
    and request.status = 'pending'
  order by request.created_at desc
  limit 1;

  if existing_request_id is not null then
    return query select
      true,
      'already_pending',
      'A password reset request is already waiting for super admin approval.',
      existing_request_id;
    return;
  end if;

  insert into public.password_reset_requests (email, status, user_agent)
  values (safe_email, 'pending', p_user_agent)
  returning id into created_request_id;

  return query select
    true,
    'created',
    'Password reset request submitted. If approved, the reset link will be sent to your registered email.',
    created_request_id;
end;
$$;

revoke all on function public.create_password_reset_approval_request(text, text) from public;
grant execute on function public.create_password_reset_approval_request(text, text) to anon, authenticated;
