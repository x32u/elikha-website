-- Durable in-app and email notifications for E-Likha.
-- Event creation is database-owned. Browser users can only read their own
-- notifications and update read state/preferences.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;
grant usage on schema private to postgres;

create table public.notification_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  in_app_enabled boolean not null default true,
  email_enabled boolean not null default true,
  activity_assigned boolean not null default true,
  grade_posted boolean not null default true,
  due_soon boolean not null default true,
  missing_work boolean not null default true,
  account_updates boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.users(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  student_id uuid references public.users(id) on delete set null,
  activity_id uuid references public.activities(id) on delete set null,
  submission_id uuid references public.submissions(id) on delete set null,
  type text not null check (type in (
    'account_registered',
    'student_linked',
    'activity_assigned',
    'submission_received',
    'grade_posted',
    'due_soon',
    'missing_work',
    'password_reset_approved',
    'password_reset_rejected'
  )),
  title text not null check (char_length(title) between 1 and 200),
  message text not null check (char_length(message) between 1 and 8000),
  action_url text check (action_url is null or (action_url ~ '^/[A-Za-z0-9/_?&=.%:#-]*$' and action_url !~ '^//')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  event_key text not null unique check (char_length(event_key) between 1 and 500),
  in_app_visible boolean not null default true,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null unique references public.notifications(id) on delete cascade,
  recipient_id uuid not null references public.users(id) on delete cascade,
  state text not null default 'pending' check (state in ('pending', 'processing', 'sent', 'failed', 'dead')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  claimed_by text,
  sent_at timestamptz,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auth-hook delivery receipts are server-only and use a payload-derived key
-- because Supabase retries can use a different webhook-id for each attempt.
create table public.auth_email_deliveries (
  delivery_key text primary key check (char_length(delivery_key) between 1 and 500),
  state text not null default 'processing' check (state in ('processing', 'sent')),
  claim_id uuid not null,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notifications_recipient_created_idx
  on public.notifications(recipient_id, created_at desc);
create index notifications_recipient_unread_idx
  on public.notifications(recipient_id, created_at desc)
  where read_at is null;
create index notifications_student_idx on public.notifications(student_id, created_at desc);
create index email_outbox_claim_idx
  on public.email_outbox(state, next_attempt_at, created_at)
  where state in ('pending', 'failed', 'processing');

alter table public.notification_preferences enable row level security;
alter table public.notifications enable row level security;
alter table public.email_outbox enable row level security;
alter table public.auth_email_deliveries enable row level security;

revoke all on table public.notification_preferences from anon, authenticated;
revoke all on table public.notifications from anon, authenticated;
revoke all on table public.email_outbox from anon, authenticated;
revoke all on table public.auth_email_deliveries from anon, authenticated;
grant select on table public.notification_preferences to authenticated;
grant insert (
  user_id, in_app_enabled, email_enabled, activity_assigned,
  grade_posted, due_soon, missing_work, account_updates
) on table public.notification_preferences to authenticated;
grant update (
  user_id, in_app_enabled, email_enabled, activity_assigned,
  grade_posted, due_soon, missing_work, account_updates
) on table public.notification_preferences to authenticated;
grant select on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;

create policy "Users read own notification preferences"
on public.notification_preferences for select to authenticated
using (user_id = (select auth.uid()));

create policy "Users insert own notification preferences"
on public.notification_preferences for insert to authenticated
with check (user_id = (select auth.uid()));

create policy "Users update own notification preferences"
on public.notification_preferences for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Recipients read own notifications"
on public.notifications for select to authenticated
using (
  recipient_id = (select auth.uid())
  and in_app_visible
  and (
    student_id is null
    or coalesce(public.elikha_current_role(), 'parent') <> 'parent'
    or exists (
      select 1 from public.parent_students ps
      where ps.parent_id = (select auth.uid()) and ps.student_id = notifications.student_id
    )
  )
);

create policy "Recipients update own notifications"
on public.notifications for update to authenticated
using (
  recipient_id = (select auth.uid()) and in_app_visible
  and (
    student_id is null
    or coalesce(public.elikha_current_role(), 'parent') <> 'parent'
    or exists (
      select 1 from public.parent_students ps
      where ps.parent_id = (select auth.uid()) and ps.student_id = notifications.student_id
    )
  )
)
with check (
  recipient_id = (select auth.uid()) and in_app_visible
  and (
    student_id is null
    or coalesce(public.elikha_current_role(), 'parent') <> 'parent'
    or exists (
      select 1 from public.parent_students ps
      where ps.parent_id = (select auth.uid()) and ps.student_id = notifications.student_id
    )
  )
);

create or replace function private.elikha_touch_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger notification_preferences_touch_updated_at
before update on public.notification_preferences
for each row execute function private.elikha_touch_notification_preferences();

create or replace function private.elikha_notification_preference_enabled(
  p_recipient_id uuid,
  p_event_type text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_event_type
    when 'activity_assigned' then coalesce(p.activity_assigned, true)
    when 'grade_posted' then coalesce(p.grade_posted, true)
    when 'due_soon' then coalesce(p.due_soon, true)
    when 'missing_work' then coalesce(p.missing_work, true)
    else coalesce(p.account_updates, true)
  end
  from (select 1) seed
  left join public.notification_preferences p on p.user_id = p_recipient_id;
$$;

create or replace function private.elikha_create_notification(
  p_recipient_id uuid,
  p_actor_id uuid,
  p_student_id uuid,
  p_activity_id uuid,
  p_submission_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_action_url text,
  p_metadata jsonb,
  p_event_key text,
  p_enqueue_email boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_id uuid;
  in_app_is_enabled boolean;
  email_is_enabled boolean;
  recipient_role text;
begin
  if p_recipient_id is null or not private.elikha_notification_preference_enabled(p_recipient_id, p_type) then
    return null;
  end if;

  select
    coalesce(p.in_app_enabled, true),
    coalesce(p.email_enabled, true),
    replace(replace(replace(lower(coalesce(u.role, '')), '_', ''), '-', ''), ' ', '')
  into in_app_is_enabled, email_is_enabled, recipient_role
  from public.users u
  left join public.notification_preferences p on p.user_id = u.id
  where u.id = p_recipient_id;

  if recipient_role is null then
    return null;
  end if;

  insert into public.notifications (
    recipient_id, actor_id, student_id, activity_id, submission_id,
    type, title, message, action_url, metadata, event_key, in_app_visible
  ) values (
    p_recipient_id, p_actor_id, p_student_id, p_activity_id, p_submission_id,
    p_type, p_title, p_message, p_action_url, coalesce(p_metadata, '{}'::jsonb), p_event_key,
    in_app_is_enabled
  )
  on conflict (event_key) do nothing
  returning id into created_id;

  if created_id is null or not p_enqueue_email then
    return created_id;
  end if;

  -- App-event email is parent-only. Required authentication email for every
  -- role is handled separately by the signed Supabase Auth Send Email Hook.
  if recipient_role = 'parent' and email_is_enabled then
    insert into public.email_outbox (notification_id, recipient_id)
    values (created_id, p_recipient_id)
    on conflict (notification_id) do nothing;
  end if;

  return created_id;
end;
$$;

create or replace function private.elikha_due_instant(p_due_date timestamp without time zone)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select case
    when p_due_date is null then null
    when p_due_date::time = time '00:00:00'
      then ((p_due_date::date + time '23:59:59.999999') at time zone 'Asia/Manila')
    else p_due_date at time zone 'UTC'
  end;
$$;

create or replace function private.elikha_notify_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  activity_title text;
  parent_row record;
begin
  select a.title into activity_title from public.activities a where a.id = new.activity_id;

  perform private.elikha_create_notification(
    new.student_id, null, new.student_id, new.activity_id, null,
    'activity_assigned', 'New activity assigned',
    format('You have been assigned "%s".', coalesce(activity_title, 'Untitled activity')),
    format('/activity/%s', new.activity_id),
    jsonb_build_object('assignment_id', new.id),
    format('assignment:%s:student:%s', new.id, new.student_id), true
  );

  for parent_row in
    select ps.parent_id from public.parent_students ps where ps.student_id = new.student_id
  loop
    perform private.elikha_create_notification(
      parent_row.parent_id, null, new.student_id, new.activity_id, null,
      'activity_assigned', 'New activity assigned',
      format('A new activity, "%s", was assigned to your child.', coalesce(activity_title, 'Untitled activity')),
      null, jsonb_build_object('assignment_id', new.id),
      format('assignment:%s:parent:%s', new.id, parent_row.parent_id), true
    );
  end loop;
  return new;
end;
$$;

create or replace function private.elikha_notify_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  activity_title text;
  teacher_id uuid;
  parent_row record;
  is_reviewed boolean;
  was_reviewed boolean;
  submission_version text;
  review_version text;
begin
  select a.title, a.teacher_id into activity_title, teacher_id
  from public.activities a where a.id = new.activity_id;

  is_reviewed := new.reviewed_at is not null
    or lower(coalesce(new.status, '')) in ('reviewed', 'graded', 'completed');
  if tg_op = 'UPDATE' then
    was_reviewed := old.reviewed_at is not null
      or lower(coalesce(old.status, '')) in ('reviewed', 'graded', 'completed');
  else
    was_reviewed := false;
  end if;

  if tg_op = 'INSERT' then
    submission_version := coalesce(to_char(new.submitted_at, 'YYYYMMDDHH24MISSUS'), new.id::text);
    perform private.elikha_create_notification(
      teacher_id, new.student_id, new.student_id, new.activity_id, new.id,
      'submission_received', 'Submission ready for review',
      format('A learner submitted "%s".', coalesce(activity_title, 'Untitled activity')),
      '/reviews', jsonb_build_object('submission_id', new.id),
      format('submission:%s:%s:teacher:%s', new.id, submission_version, teacher_id), true
    );
  elsif coalesce(new.submitted_at, timestamp 'epoch') is distinct from coalesce(old.submitted_at, timestamp 'epoch') then
    submission_version := coalesce(to_char(new.submitted_at, 'YYYYMMDDHH24MISSUS'), new.id::text);
    perform private.elikha_create_notification(
      teacher_id, new.student_id, new.student_id, new.activity_id, new.id,
      'submission_received', 'Submission ready for review',
      format('A learner submitted "%s".', coalesce(activity_title, 'Untitled activity')),
      '/reviews', jsonb_build_object('submission_id', new.id),
      format('submission:%s:%s:teacher:%s', new.id, submission_version, teacher_id), true
    );
  end if;

  if is_reviewed and (
    not was_reviewed
    or (
      tg_op = 'UPDATE' and (
        new.score is distinct from old.score
        or new.feedback is distinct from old.feedback
        or new.reviewed_at is distinct from old.reviewed_at
      )
    )
  ) then
    review_version := md5(concat_ws('|', new.reviewed_at::text, new.score::text, new.feedback, new.status));
    perform private.elikha_create_notification(
      new.student_id, new.reviewed_by, new.student_id, new.activity_id, new.id,
      'grade_posted', 'Activity reviewed',
      format('Your work for "%s" has been reviewed%s.',
        coalesce(activity_title, 'Untitled activity'),
        case when new.score is null then '' else format(' with a rating of %s out of 5', least(5, greatest(1, case when new.score > 5 then round(new.score / 20.0)::int else new.score end))) end),
      format('/activity/%s', new.activity_id), jsonb_build_object('score', new.score),
      format('review:%s:%s:student:%s', new.id, review_version, new.student_id), true
    );

    for parent_row in
      select ps.parent_id from public.parent_students ps where ps.student_id = new.student_id
    loop
      perform private.elikha_create_notification(
        parent_row.parent_id, new.reviewed_by, new.student_id, new.activity_id, new.id,
        'grade_posted', 'Your child received feedback',
        format('Your child''s work for "%s" has been reviewed%s.',
          coalesce(activity_title, 'Untitled activity'),
          case when new.score is null then '' else format(' with a rating of %s out of 5', least(5, greatest(1, case when new.score > 5 then round(new.score / 20.0)::int else new.score end))) end),
        null, jsonb_build_object('score', new.score),
        format('review:%s:%s:parent:%s', new.id, review_version, parent_row.parent_id), true
      );
    end loop;
  end if;
  return new;
end;
$$;

create or replace function private.elikha_notify_parent_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  student_name text;
begin
  select u.name into student_name from public.users u where u.id = new.student_id;
  perform private.elikha_create_notification(
    new.parent_id, null, new.student_id, null, null,
    'student_linked', 'Student account linked',
    format('%s is now linked to your parent account.', coalesce(student_name, 'A student')),
    null, jsonb_build_object('parent_student_id', new.id),
    format('parent-link:%s', new.id), true
  );
  return new;
end;
$$;

create or replace function private.elikha_cleanup_parent_unlink()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Once a parent is unlinked, child-specific history and any unsent email
  -- are no longer available to that former parent. Outbox rows cascade.
  delete from public.notifications n
  where n.recipient_id = old.parent_id and n.student_id = old.student_id;
  return old;
end;
$$;

create or replace function private.elikha_guard_parent_link_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is distinct from old.parent_id or new.student_id is distinct from old.student_id then
    raise exception 'Parent/student links are immutable; delete the old link and create a new one';
  end if;
  return new;
end;
$$;

create or replace function private.elikha_notify_user_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.elikha_create_notification(
    new.id, null, null, null, null,
    'account_registered', 'Welcome to E-Likha',
    'Your E-Likha account is ready.', '/settings',
    jsonb_build_object('role', new.role), format('registration:%s', new.id), true
  );
  return new;
end;
$$;

create or replace function private.elikha_notify_password_reset()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient uuid;
begin
  if new.status not in ('approved', 'rejected') or new.status is not distinct from old.status then
    return new;
  end if;
  select u.id into recipient from public.users u
  where lower(trim(u.email)) = lower(trim(new.email)) limit 1;
  if recipient is null then return new; end if;

  perform private.elikha_create_notification(
    recipient, new.reviewed_by, null, null, null,
    case when new.status = 'approved' then 'password_reset_approved' else 'password_reset_rejected' end,
    case when new.status = 'approved' then 'Password reset approved' else 'Password reset request declined' end,
    case when new.status = 'approved'
      then 'Your password reset was approved. Check your email for the secure reset link.'
      else coalesce('Your password reset request was declined. ' || nullif(new.rejection_reason, ''), 'Your password reset request was declined.')
    end,
    null, jsonb_build_object('request_id', new.id),
    format('password-reset:%s:%s', new.id, new.status), false
  );
  return new;
end;
$$;

create trigger notifications_assignment_created
after insert on public.activity_assignments for each row
execute function private.elikha_notify_assignment();

create trigger notifications_submission_changed
after insert or update of submitted_at, reviewed_at, score, feedback, status on public.submissions
for each row execute function private.elikha_notify_submission();

create trigger notifications_parent_link_created
after insert on public.parent_students for each row
execute function private.elikha_notify_parent_link();

create trigger notifications_parent_link_removed
after delete on public.parent_students for each row
execute function private.elikha_cleanup_parent_unlink();

create trigger notifications_parent_link_identity_guard
before update on public.parent_students for each row
execute function private.elikha_guard_parent_link_identity();

create trigger notifications_user_registered
after insert on public.users for each row
execute function private.elikha_notify_user_registration();

create trigger notifications_password_reset_changed
after update of status on public.password_reset_requests for each row
execute function private.elikha_notify_password_reset();

create or replace function private.elikha_generate_activity_reminders(p_recipient_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data record;
  recipient uuid;
  recipient_role text;
  reminder_type text;
  reminder_title text;
  reminder_message text;
  reminder_key text;
  created_id uuid;
  generated integer := 0;
begin
  for row_data in
    select aa.id assignment_id, aa.student_id, aa.activity_id,
      a.title activity_title, a.due_date,
      private.elikha_due_instant(a.due_date) due_at
    from public.activity_assignments aa
    join public.activities a on a.id = aa.activity_id
    where a.due_date is not null
      and not exists (
        select 1 from public.submissions s
        where s.activity_id = aa.activity_id and s.student_id = aa.student_id
          and (s.submitted_at is not null or lower(coalesce(s.status, '')) in ('submitted','late','reviewed','graded','completed'))
      )
      and private.elikha_due_instant(a.due_date) <= now() + interval '24 hours'
  loop
    if row_data.due_at < now() then
      reminder_type := 'missing_work';
      reminder_title := 'Activity is missing';
      reminder_message := format('"%s" is past its due date and has not been submitted.', coalesce(row_data.activity_title, 'An activity'));
    else
      reminder_type := 'due_soon';
      reminder_title := 'Activity due soon';
      reminder_message := format('"%s" is due within 24 hours.', coalesce(row_data.activity_title, 'An activity'));
    end if;

    for recipient, recipient_role in
      select row_data.student_id, 'student'
      union all
      select ps.parent_id, 'parent' from public.parent_students ps where ps.student_id = row_data.student_id
    loop
      if p_recipient_id is not null and recipient <> p_recipient_id then continue; end if;
      reminder_key := format('%s:%s:%s:%s', reminder_type, row_data.assignment_id, row_data.due_date::date, recipient);
      created_id := private.elikha_create_notification(
        recipient, null, row_data.student_id, row_data.activity_id, null,
        reminder_type, reminder_title,
        case
          when recipient_role = 'parent' and reminder_type = 'missing_work'
            then format('Your child has not submitted "%s", which is now past due.', coalesce(row_data.activity_title, 'an activity'))
          when recipient_role = 'parent'
            then format('Your child''s activity "%s" is due within 24 hours.', coalesce(row_data.activity_title, 'Untitled activity'))
          else reminder_message
        end,
        case when recipient_role = 'student' then format('/activity/%s', row_data.activity_id) else null end,
        jsonb_build_object('assignment_id', row_data.assignment_id, 'due_at', row_data.due_at),
        reminder_key, true
      );
      if created_id is not null then generated := generated + 1; end if;
    end loop;
  end loop;
  return generated;
end;
$$;

create or replace function public.refresh_my_activity_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  return private.elikha_generate_activity_reminders(auth.uid());
end;
$$;

create or replace function public.generate_parent_activity_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  return private.elikha_generate_activity_reminders(null);
end;
$$;

create or replace function public.claim_notification_email_outbox(
  p_limit integer default 25,
  p_worker_id text default null
)
returns table (
  id uuid,
  notification_id uuid,
  recipient_id uuid,
  recipient_email text,
  recipient_name text,
  type text,
  subject text,
  title text,
  message text,
  action_url text,
  metadata jsonb,
  event_key text,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  if nullif(trim(p_worker_id), '') is null then raise exception 'Worker ID required'; end if;

  update public.email_outbox
  set state = 'dead', last_error = 'Maximum delivery attempts reached',
      claimed_at = null, claimed_by = null, updated_at = now()
  where state = 'processing' and attempt_count >= 8
    and claimed_at < now() - interval '15 minutes';

  -- Preferences are checked again at delivery time so disabling email or an
  -- event category also cancels already queued, unsent messages.
  update public.email_outbox o
  set state = 'dead', last_error = 'Email delivery disabled by current notification preferences',
      claimed_at = null, claimed_by = null, updated_at = now()
  from public.notifications n
  join public.users u on u.id = n.recipient_id
  left join public.notification_preferences p on p.user_id = n.recipient_id
  where o.notification_id = n.id
    and (
      o.state in ('pending', 'failed')
      or (o.state = 'processing' and o.claimed_at < now() - interval '15 minutes')
    )
    and (
      replace(replace(replace(lower(coalesce(u.role, '')), '_', ''), '-', ''), ' ', '') <> 'parent'
      or not coalesce(p.email_enabled, true)
      or not case n.type
        when 'activity_assigned' then coalesce(p.activity_assigned, true)
        when 'grade_posted' then coalesce(p.grade_posted, true)
        when 'due_soon' then coalesce(p.due_soon, true)
        when 'missing_work' then coalesce(p.missing_work, true)
        else coalesce(p.account_updates, true)
      end
    );

  return query
  with claimed as (
    select o.id
    from public.email_outbox o
    where o.attempt_count < 8
      and (
        (o.state in ('pending','failed') and o.next_attempt_at <= now())
        or (o.state = 'processing' and o.claimed_at < now() - interval '15 minutes')
      )
    order by o.next_attempt_at, o.created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit, 25), 1), 50)
  ), updated as (
    update public.email_outbox o
    set state = 'processing', claimed_at = now(), claimed_by = p_worker_id,
        attempt_count = o.attempt_count + 1, updated_at = now(), last_error = null
    from claimed c where o.id = c.id
    returning o.*
  )
  select uo.id, uo.notification_id, uo.recipient_id,
    usr.email, usr.name, n.type, n.title, n.title, n.message,
    n.action_url, n.metadata, n.event_key, uo.attempt_count
  from updated uo
  join public.notifications n on n.id = uo.notification_id
  join public.users usr on usr.id = uo.recipient_id;
end;
$$;

create or replace function public.complete_notification_email(
  p_outbox_id uuid,
  p_worker_id text default null,
  p_provider_message_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare changed integer;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  update public.email_outbox
  set state = 'sent', sent_at = now(), provider_message_id = left(p_provider_message_id, 500),
      claimed_at = null, claimed_by = null, updated_at = now(), last_error = null
  where id = p_outbox_id and state = 'processing' and claimed_by = p_worker_id;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

create or replace function public.fail_notification_email(
  p_outbox_id uuid,
  p_error text,
  p_worker_id text default null,
  p_retry_after_seconds integer default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
  retry_seconds integer;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  retry_seconds := least(greatest(coalesce(p_retry_after_seconds, 60), 30), 86400);
  update public.email_outbox
  set state = case when attempt_count >= 8 then 'dead' else 'failed' end,
      next_attempt_at = now() + make_interval(secs => retry_seconds),
      last_error = left(coalesce(p_error, 'Unknown delivery error'), 2000),
      claimed_at = null, claimed_by = null, updated_at = now()
  where id = p_outbox_id and state = 'processing' and claimed_by = p_worker_id;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

create or replace function public.claim_auth_email_delivery(p_delivery_key text, p_claim_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery_state text;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  if nullif(trim(p_delivery_key), '') is null or char_length(p_delivery_key) > 500 or p_claim_id is null then
    raise exception 'Valid delivery key required';
  end if;

  insert into public.auth_email_deliveries(delivery_key, claim_id)
  values (p_delivery_key, p_claim_id)
  on conflict (delivery_key) do update
    set state = 'processing', claim_id = excluded.claim_id, claimed_at = now(), updated_at = now()
    where public.auth_email_deliveries.state = 'processing'
      and public.auth_email_deliveries.claimed_at < now() - interval '30 seconds';
  select case
    when d.state = 'sent' then 'sent'
    when d.claim_id = p_claim_id then 'claimed'
    else 'processing'
  end into delivery_state
  from public.auth_email_deliveries d
  where d.delivery_key = p_delivery_key;
  return delivery_state;
end;
$$;

create or replace function public.complete_auth_email_delivery(
  p_delivery_key text,
  p_claim_id uuid,
  p_provider_message_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  update public.auth_email_deliveries
  set state = 'sent', sent_at = now(), provider_message_id = left(p_provider_message_id, 500),
      updated_at = now()
  where delivery_key = p_delivery_key and state = 'processing' and claim_id = p_claim_id;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

create or replace function public.release_auth_email_delivery(p_delivery_key text, p_claim_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  delete from public.auth_email_deliveries
  where delivery_key = p_delivery_key and state = 'processing' and claim_id = p_claim_id;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.refresh_my_activity_reminders() from public, anon;
grant execute on function public.refresh_my_activity_reminders() to authenticated;
revoke all on function public.generate_parent_activity_reminders() from public, anon, authenticated;
grant execute on function public.generate_parent_activity_reminders() to service_role;
revoke all on function public.claim_notification_email_outbox(integer, text) from public, anon, authenticated;
grant execute on function public.claim_notification_email_outbox(integer, text) to service_role;
revoke all on function public.complete_notification_email(uuid, text, text) from public, anon, authenticated;
grant execute on function public.complete_notification_email(uuid, text, text) to service_role;
revoke all on function public.fail_notification_email(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.fail_notification_email(uuid, text, text, integer) to service_role;
revoke all on function public.claim_auth_email_delivery(text, uuid) from public, anon, authenticated;
grant execute on function public.claim_auth_email_delivery(text, uuid) to service_role;
revoke all on function public.complete_auth_email_delivery(text, uuid, text) from public, anon, authenticated;
grant execute on function public.complete_auth_email_delivery(text, uuid, text) to service_role;
revoke all on function public.release_auth_email_delivery(text, uuid) from public, anon, authenticated;
grant execute on function public.release_auth_email_delivery(text, uuid) to service_role;

revoke execute on function public.elikha_is_parent_of(uuid) from anon;
revoke execute on function public.elikha_parent_has_activity(uuid) from anon;
revoke execute on function public.elikha_parent_has_class(uuid) from anon;
revoke execute on function public.get_password_reset_approval_requests() from anon;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- Existing records are backfilled only to the in-app table. Historical events
-- intentionally do not enter the email outbox.
insert into public.notifications (
  recipient_id, student_id, activity_id, type, title, message, action_url, metadata, event_key, created_at
)
select aa.student_id, aa.student_id, aa.activity_id, 'activity_assigned', 'Activity assigned',
  format('You were assigned "%s".', coalesce(a.title, 'Untitled activity')),
  format('/activity/%s', aa.activity_id), jsonb_build_object('assignment_id', aa.id),
  format('assignment:%s:student:%s', aa.id, aa.student_id),
  coalesce(aa.assigned_at at time zone 'UTC', now())
from public.activity_assignments aa
join public.activities a on a.id = aa.activity_id
on conflict (event_key) do nothing;

insert into public.notifications (
  recipient_id, student_id, activity_id, type, title, message, metadata, event_key, created_at
)
select ps.parent_id, aa.student_id, aa.activity_id, 'activity_assigned', 'Activity assigned',
  format('"%s" was assigned to your child.', coalesce(a.title, 'An activity')),
  jsonb_build_object('assignment_id', aa.id),
  format('assignment:%s:parent:%s', aa.id, ps.parent_id),
  coalesce(aa.assigned_at at time zone 'UTC', now())
from public.activity_assignments aa
join public.activities a on a.id = aa.activity_id
join public.parent_students ps on ps.student_id = aa.student_id
on conflict (event_key) do nothing;

insert into public.notifications (
  recipient_id, student_id, type, title, message, metadata, event_key, created_at
)
select ps.parent_id, ps.student_id, 'student_linked', 'Student account linked',
  format('%s is linked to your parent account.', coalesce(u.name, 'A student')),
  jsonb_build_object('parent_student_id', ps.id), format('parent-link:%s', ps.id), ps.linked_at
from public.parent_students ps join public.users u on u.id = ps.student_id
on conflict (event_key) do nothing;

insert into public.notifications (
  recipient_id, student_id, activity_id, submission_id, type, title, message,
  action_url, metadata, event_key, created_at
)
select s.student_id, s.student_id, s.activity_id, s.id, 'grade_posted', 'Activity reviewed',
  format('Your work for "%s" has been reviewed.', coalesce(a.title, 'Untitled activity')),
  format('/activity/%s', s.activity_id), jsonb_build_object('score', s.score),
  format('review-backfill:%s:student:%s', s.id, s.student_id),
  coalesce(s.reviewed_at at time zone 'UTC', s.submitted_at at time zone 'UTC', now())
from public.submissions s
join public.activities a on a.id = s.activity_id
where s.reviewed_at is not null or lower(coalesce(s.status, '')) in ('reviewed', 'graded', 'completed')
on conflict (event_key) do nothing;

insert into public.notifications (
  recipient_id, student_id, activity_id, submission_id, type, title, message,
  metadata, event_key, created_at
)
select ps.parent_id, s.student_id, s.activity_id, s.id, 'grade_posted',
  'Your child received feedback',
  format('Your child''s work for "%s" has been reviewed.', coalesce(a.title, 'Untitled activity')),
  jsonb_build_object('score', s.score),
  format('review-backfill:%s:parent:%s', s.id, ps.parent_id),
  coalesce(s.reviewed_at at time zone 'UTC', s.submitted_at at time zone 'UTC', now())
from public.submissions s
join public.activities a on a.id = s.activity_id
join public.parent_students ps on ps.student_id = s.student_id
where s.reviewed_at is not null or lower(coalesce(s.status, '')) in ('reviewed', 'graded', 'completed')
on conflict (event_key) do nothing;

-- Establish a no-email baseline for work that was already due/missing when
-- this feature launched. The first cron run sees the same event keys and will
-- not unexpectedly email parents about historical test or classroom work.
insert into public.notifications (
  recipient_id, student_id, activity_id, type, title, message, action_url,
  metadata, event_key, created_at
)
select aa.student_id, aa.student_id, aa.activity_id,
  'missing_work', 'Activity is missing',
  format('"%s" is past its due date and has not been submitted.', coalesce(a.title, 'An activity')),
  format('/activity/%s', aa.activity_id),
  jsonb_build_object('assignment_id', aa.id, 'due_at', private.elikha_due_instant(a.due_date)),
  format('missing_work:%s:%s:%s', aa.id, a.due_date::date, aa.student_id),
  now()
from public.activity_assignments aa
join public.activities a on a.id = aa.activity_id
where a.due_date is not null
  and private.elikha_due_instant(a.due_date) < now()
  and not exists (
    select 1 from public.submissions s
    where s.activity_id = aa.activity_id and s.student_id = aa.student_id
      and (s.submitted_at is not null or lower(coalesce(s.status, '')) in ('submitted','late','reviewed','graded','completed'))
  )
on conflict (event_key) do nothing;

insert into public.notifications (
  recipient_id, student_id, activity_id, type, title, message,
  metadata, event_key, created_at
)
select ps.parent_id, aa.student_id, aa.activity_id,
  'missing_work', 'Activity is missing',
  format('Your child has not submitted "%s", which is now past due.', coalesce(a.title, 'an activity')),
  jsonb_build_object('assignment_id', aa.id, 'due_at', private.elikha_due_instant(a.due_date)),
  format('missing_work:%s:%s:%s', aa.id, a.due_date::date, ps.parent_id),
  now()
from public.activity_assignments aa
join public.activities a on a.id = aa.activity_id
join public.parent_students ps on ps.student_id = aa.student_id
where a.due_date is not null
  and private.elikha_due_instant(a.due_date) < now()
  and not exists (
    select 1 from public.submissions s
    where s.activity_id = aa.activity_id and s.student_id = aa.student_id
      and (s.submitted_at is not null or lower(coalesce(s.status, '')) in ('submitted','late','reviewed','graded','completed'))
  )
on conflict (event_key) do nothing;

insert into public.notifications (
  recipient_id, type, title, message, action_url, metadata, event_key, created_at
)
select u.id, 'account_registered', 'Welcome to E-Likha', 'Your E-Likha account is ready.',
  '/settings', jsonb_build_object('role', u.role), format('registration:%s', u.id), coalesce(u.created_at, now())
from public.users u
on conflict (event_key) do nothing;

-- Parent password recovery follows the same approved Supabase Auth flow as
-- student and teacher accounts.
create unique index if not exists password_reset_requests_one_pending_email_idx
  on public.password_reset_requests (lower(trim(email)))
  where status = 'pending';

create or replace function public.get_password_reset_approval_requests()
returns table (
  id uuid, email text, status text, user_agent text, rejection_reason text,
  requested_at timestamptz, reset_sent_at timestamptz, reviewed_at timestamptz,
  reviewed_by uuid, created_at timestamptz, updated_at timestamptz,
  account_id uuid, account_name text, account_role text, is_reset_allowed boolean
)
language sql security definer set search_path = ''
as $$
  select request.id, request.email, request.status, request.user_agent,
    request.rejection_reason, request.requested_at, request.reset_sent_at,
    request.reviewed_at, request.reviewed_by, request.created_at, request.updated_at,
    account.id, coalesce(account.name, 'Unknown account'), coalesce(account.role, 'unknown'),
    replace(replace(replace(lower(coalesce(account.role, '')), '_', ''), '-', ''), ' ', '')
      in ('student', 'teacher', 'parent')
  from public.password_reset_requests request
  left join public.users account on lower(trim(account.email)) = lower(trim(request.email))
  where exists (
    select 1 from public.users current_profile
    where current_profile.id = auth.uid()
      and replace(replace(replace(lower(coalesce(current_profile.role, '')), '_', ''), '-', ''), ' ', '') = 'superadmin'
  )
  order by request.created_at desc;
$$;
revoke all on function public.get_password_reset_approval_requests() from public, anon;
grant execute on function public.get_password_reset_approval_requests() to authenticated;

create or replace function public.create_password_reset_approval_request(
  p_email text,
  p_user_agent text default null
)
returns table (success boolean, code text, message text, request_id uuid)
language plpgsql security definer set search_path = ''
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
    return query select false, 'invalid_email', 'Enter a valid email address.', null::uuid;
    return;
  end if;
  select u.id, replace(replace(replace(lower(coalesce(u.role, '')), '_', ''), '-', ''), ' ', '')
  into matched_user_id, normalized_role
  from public.users u where lower(trim(u.email)) = safe_email limit 1;
  if matched_user_id is null then
    return query select true, 'accepted',
      'If an eligible account matches this email, the request will be reviewed.', null::uuid;
    return;
  end if;
  if normalized_role not in ('student', 'teacher', 'parent') then
    return query select true, 'accepted',
      'If an eligible account matches this email, the request will be reviewed.', null::uuid;
    return;
  end if;
  select r.id into existing_request_id from public.password_reset_requests r
  where lower(trim(r.email)) = safe_email and r.status = 'pending'
  order by r.created_at desc limit 1;
  if existing_request_id is not null then
    return query select true, 'accepted',
      'If an eligible account matches this email, the request will be reviewed.', null::uuid;
    return;
  end if;
  begin
    insert into public.password_reset_requests(email, status, user_agent)
    values (safe_email, 'pending', left(p_user_agent, 1000)) returning id into created_request_id;
  exception when unique_violation then
    created_request_id := null;
  end;
  return query select true, 'accepted',
    'If an eligible account matches this email, the request will be reviewed.', null::uuid;
end;
$$;
revoke insert on table public.password_reset_requests from anon, authenticated;
drop policy if exists "Anyone can request password reset approval" on public.password_reset_requests;
revoke all on function public.create_password_reset_approval_request(text, text) from public;
grant execute on function public.create_password_reset_approval_request(text, text) to anon, authenticated;

-- Trigger-only/private functions must not be callable through the Data API.
revoke all on function private.elikha_notification_preference_enabled(uuid, text) from public, anon, authenticated;
revoke all on function private.elikha_create_notification(uuid, uuid, uuid, uuid, uuid, text, text, text, text, jsonb, text, boolean) from public, anon, authenticated;
revoke all on function private.elikha_due_instant(timestamp without time zone) from public, anon, authenticated;
revoke all on function private.elikha_notify_assignment() from public, anon, authenticated;
revoke all on function private.elikha_notify_submission() from public, anon, authenticated;
revoke all on function private.elikha_notify_parent_link() from public, anon, authenticated;
revoke all on function private.elikha_cleanup_parent_unlink() from public, anon, authenticated;
revoke all on function private.elikha_guard_parent_link_identity() from public, anon, authenticated;
revoke all on function private.elikha_touch_notification_preferences() from public, anon, authenticated;
revoke all on function private.elikha_notify_user_registration() from public, anon, authenticated;
revoke all on function private.elikha_notify_password_reset() from public, anon, authenticated;
revoke all on function private.elikha_generate_activity_reminders(uuid) from public, anon, authenticated;
