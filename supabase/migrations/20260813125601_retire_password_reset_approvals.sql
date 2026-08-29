-- Password recovery now uses Supabase Auth's email recovery OTP directly.
-- Keep all historical request rows and functions for audit/migration safety,
-- but retire every browser-accessible approval entry point.

revoke all privileges on table public.password_reset_requests
from public, anon, authenticated;

revoke all on function public.create_password_reset_approval_request(text, text)
from public, anon, authenticated;

revoke all on function public.get_password_reset_approval_requests()
from public, anon, authenticated;

-- Approval decisions are no longer produced, so their in-app notification
-- trigger must not create misleading approval/rejection messages.
drop trigger if exists notifications_password_reset_changed
on public.password_reset_requests;
