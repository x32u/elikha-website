-- Keep the report policy self-contained by using a report-specific helper.
-- The shared project also has elikha_is_admin(), but this avoids coupling this
-- migration to database/admin_class_access.sql on another installation.
create or replace function public.elikha_reports_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and replace(replace(replace(lower(coalesce(u.role, '')), '_', ''), '-', ''), ' ', '')
        in ('admin', 'superadmin')
  );
$$;

revoke all on function public.elikha_reports_is_admin() from public;
revoke all on function public.elikha_reports_is_admin() from anon;
grant execute on function public.elikha_reports_is_admin() to authenticated;

-- Reports use the existing tables and their row-level ownership rules. Admin
-- analytics also needs read-only visibility into submissions; teachers,
-- students, and parents retain their existing scoped policies.
alter table public.submissions enable row level security;

drop policy if exists "Admins can view all submissions" on public.submissions;
create policy "Admins can view all submissions"
on public.submissions
for select
to authenticated
using (public.elikha_reports_is_admin());

grant select on table public.submissions to authenticated;
