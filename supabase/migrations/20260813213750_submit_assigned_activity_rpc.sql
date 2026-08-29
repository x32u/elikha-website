-- Install the authenticated, assignment-bound AR submission endpoint used by
-- the web client. This migration is intentionally scoped to submission flow;
-- the broader release security migration remains separate.

-- Link legacy submissions to their existing assignment before enforcing the
-- canonical one-submission-per-learner/activity contract.
update public.submissions submission
set assignment_id = assignment.id
from public.activity_assignments assignment
where submission.assignment_id is null
  and assignment.activity_id = submission.activity_id
  and assignment.student_id = submission.student_id;

create unique index if not exists submissions_activity_student_unique_idx
  on public.submissions (activity_id, student_id);

create index if not exists submissions_assignment_id_idx
  on public.submissions (assignment_id)
  where assignment_id is not null;

alter table public.submissions
  alter column assignment_id set not null;

create or replace function public.submit_assigned_activity(
  p_student_id uuid,
  p_activity_id uuid,
  p_artwork_url text default null,
  p_description text default null,
  p_artwork_title text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  assignment_row public.activity_assignments;
  submission_row public.submissions;
  activity_due_date timestamp without time zone;
  submission_status text := 'submitted';
begin
  if auth.uid() is null
     or auth.uid() <> p_student_id
     or coalesce(public.elikha_current_role(), '') <> 'student' then
    raise exception using
      errcode = '42501',
      message = 'Not allowed to submit for this learner.';
  end if;

  if nullif(trim(coalesce(p_artwork_url, '')), '') is null
     or nullif(trim(coalesce(p_description, '')), '') is null then
    raise exception using
      errcode = '22023',
      message = 'A captured artwork image and AR state are required.';
  end if;

  select assignment.* into assignment_row
  from public.activity_assignments assignment
  join public.activities activity on activity.id = assignment.activity_id
  left join public.classes class_row on class_row.id = activity.class_id
  where assignment.activity_id = p_activity_id
    and assignment.student_id = auth.uid()
    and (activity.class_id is null or class_row.is_active is true)
  for update of assignment;

  if assignment_row.id is null then
    raise exception using
      errcode = '42501',
      message = 'This activity is not assigned to the learner.';
  end if;

  select activity.due_date into activity_due_date
  from public.activities activity
  where activity.id = p_activity_id
  for share;

  if activity_due_date is not null
     and (
       case
         when activity_due_date::time = time '00:00:00'
           then ((activity_due_date::date + time '23:59:59.999999') at time zone 'Asia/Manila')
         else activity_due_date at time zone 'UTC'
       end
     ) < now() then
    submission_status := 'late';
  end if;

  select submission.* into submission_row
  from public.submissions submission
  where submission.activity_id = p_activity_id
    and submission.student_id = auth.uid()
  for update;

  if submission_row.id is not null and (
    submission_row.reviewed_at is not null
    or lower(coalesce(submission_row.status, '')) in ('reviewed', 'graded', 'completed')
  ) then
    raise exception using
      errcode = '42501',
      message = 'Reviewed work cannot be resubmitted.';
  end if;

  if submission_row.id is null then
    insert into public.submissions (
      activity_id,
      student_id,
      assignment_id,
      artwork_url,
      description,
      submitted_at,
      status,
      score,
      feedback,
      reviewed_at,
      reviewed_by
    ) values (
      p_activity_id,
      auth.uid(),
      assignment_row.id,
      p_artwork_url,
      p_description,
      now() at time zone 'UTC',
      submission_status,
      null,
      null,
      null,
      null
    )
    returning * into submission_row;
  else
    update public.submissions
    set assignment_id = assignment_row.id,
        artwork_url = p_artwork_url,
        description = p_description,
        submitted_at = now() at time zone 'UTC',
        status = submission_status
    where id = submission_row.id
    returning * into submission_row;
  end if;

  update public.activity_assignments
  set status = submission_status
  where id = assignment_row.id;

  delete from public.artworks
  where submission_id = submission_row.id;

  insert into public.artworks (
    student_id,
    submission_id,
    title,
    description,
    image_url
  ) values (
    auth.uid(),
    submission_row.id,
    coalesce(nullif(trim(p_artwork_title), ''), 'AR Submission'),
    'AR model snapshot',
    p_artwork_url
  );

  return to_jsonb(submission_row);
end;
$$;

revoke all on function public.submit_assigned_activity(uuid, uuid, text, text, text)
  from public, anon;
grant execute on function public.submit_assigned_activity(uuid, uuid, text, text, text)
  to authenticated;

notify pgrst, 'reload schema';
