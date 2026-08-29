-- The shared project already uses these helpers in its class/admin policies.
-- Keep them callable for signed-in policy evaluation, but remove anonymous
-- direct access to the security-definer functions.
do $$
begin
  if to_regprocedure('public.elikha_current_role()') is not null then
    revoke all on function public.elikha_current_role() from public;
    revoke all on function public.elikha_current_role() from anon;
    grant execute on function public.elikha_current_role() to authenticated;
  end if;

  if to_regprocedure('public.elikha_is_admin()') is not null then
    revoke all on function public.elikha_is_admin() from public;
    revoke all on function public.elikha_is_admin() from anon;
    grant execute on function public.elikha_is_admin() to authenticated;
  end if;
end
$$;
