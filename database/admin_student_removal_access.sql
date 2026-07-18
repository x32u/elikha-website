-- Lets Admin / Super Admin clean up pending activity assignments when a
-- student is removed from a class.

alter table public.activity_assignments enable row level security;

drop policy if exists "Admins can manage activity assignments" on public.activity_assignments;
create policy "Admins can manage activity assignments"
on public.activity_assignments
for all
to authenticated
using (public.elikha_is_admin())
with check (public.elikha_is_admin());
