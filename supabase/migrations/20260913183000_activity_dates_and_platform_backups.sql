-- Keep activity deadlines in the present/future while allowing legacy overdue
-- activities to be edited without changing their existing deadline.
create or replace function private.elikha_guard_activity_due_date()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'supabase_admin')
     and current_setting('elikha.backup_restore', true) = 'on' then
    return new;
  end if;

  if new.due_date is not null
     and new.due_date::date < (now() at time zone 'Asia/Manila')::date
     and (tg_op = 'INSERT' or new.due_date is distinct from old.due_date) then
    raise exception using
      errcode = '22023',
      message = 'Activity due dates cannot be in the past.';
  end if;
  return new;
end;
$$;

revoke all on function private.elikha_guard_activity_due_date()
  from public, anon, authenticated;

drop trigger if exists activities_guard_due_date on public.activities;
create trigger activities_guard_due_date
before insert or update of due_date on public.activities
for each row execute function private.elikha_guard_activity_due_date();

-- Application-data backups intentionally exclude auth credentials, storage
-- objects, email delivery queues, and platform secrets. R2 paths remain in the
-- exported rows, while the binary objects continue to live in R2.
create or replace function public.export_platform_backup()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  table_name text;
  table_rows jsonb;
  table_data jsonb := '{}'::jsonb;
  table_counts jsonb := '{}'::jsonb;
  backup_tables constant text[] := array[
    'users', 'teachers', 'classes', 'rubrics', 'activities',
    'class_students', 'parent_students', 'activity_assignments',
    'submissions', 'artworks', 'activity_rubrics',
    'submission_ai_evaluations', 'rubric_observations',
    'rubric_criterion_observations', 'notification_preferences',
    'user_settings', 'notifications', 'gesture_alerts', 'activity_lock_alerts'
  ];
begin
  if auth.uid() is null or coalesce(public.elikha_current_role(), '') <> 'superadmin' then
    raise exception using errcode = '42501', message = 'Only a super administrator can export a platform backup.';
  end if;

  foreach table_name in array backup_tables loop
    if to_regclass(format('public.%I', table_name)) is null then
      continue;
    end if;

    execute format(
      'select coalesce(jsonb_agg(to_jsonb(source_row)), ''[]''::jsonb) from public.%I source_row',
      table_name
    ) into table_rows;
    table_data := table_data || jsonb_build_object(table_name, table_rows);
    table_counts := table_counts || jsonb_build_object(table_name, jsonb_array_length(table_rows));
  end loop;

  return jsonb_build_object(
    'format', 'elikha-platform-backup',
    'version', 1,
    'created_at', now(),
    'scope', 'public-application-data',
    'storage_objects_included', false,
    'tables', table_data,
    'counts', table_counts
  );
end;
$$;

revoke all on function public.export_platform_backup() from public, anon;
grant execute on function public.export_platform_backup() to authenticated;

create or replace function public.restore_platform_backup(p_backup jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  table_name text;
  table_rows jsonb;
  column_list text;
  conflict_columns text;
  update_list text;
  restored_counts jsonb := '{}'::jsonb;
  restore_tables constant text[] := array[
    'users', 'teachers', 'classes', 'rubrics', 'activities',
    'class_students', 'parent_students', 'activity_assignments',
    'submissions', 'artworks', 'activity_rubrics',
    'submission_ai_evaluations', 'rubric_observations',
    'rubric_criterion_observations', 'notification_preferences',
    'user_settings', 'notifications', 'gesture_alerts', 'activity_lock_alerts'
  ];
begin
  if auth.uid() is null or coalesce(public.elikha_current_role(), '') <> 'superadmin' then
    raise exception using errcode = '42501', message = 'Only a super administrator can restore a platform backup.';
  end if;

  if jsonb_typeof(p_backup) <> 'object'
     or p_backup->>'format' <> 'elikha-platform-backup'
     or p_backup->>'version' <> '1'
     or jsonb_typeof(p_backup->'tables') <> 'object' then
    raise exception using errcode = '22023', message = 'Choose a valid e-Likha platform backup (version 1).';
  end if;

  perform set_config('elikha.backup_restore', 'on', true);

  foreach table_name in array restore_tables loop
    table_rows := p_backup->'tables'->table_name;
    if table_rows is null or jsonb_typeof(table_rows) <> 'array' or jsonb_array_length(table_rows) = 0 then
      continue;
    end if;
    if to_regclass(format('public.%I', table_name)) is null then
      continue;
    end if;

    select string_agg(format('%I', attribute.attname), ', ' order by attribute.attnum)
    into column_list
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = to_regclass(format('public.%I', table_name))
      and attribute.attnum > 0
      and not attribute.attisdropped
      and attribute.attgenerated = '';

    select string_agg(format('%I', attribute.attname), ', ' order by key_column.ordinality)
    into conflict_columns
    from pg_catalog.pg_index index_row
    cross join lateral unnest(index_row.indkey) with ordinality as key_column(attnum, ordinality)
    join pg_catalog.pg_attribute attribute
      on attribute.attrelid = index_row.indrelid
     and attribute.attnum = key_column.attnum
    where index_row.indrelid = to_regclass(format('public.%I', table_name))
      and index_row.indisprimary;

    if column_list is null or conflict_columns is null then
      raise exception using errcode = '55000', message = format('Backup table %s cannot be restored safely.', table_name);
    end if;

    select string_agg(format('%1$I = excluded.%1$I', attribute.attname), ', ' order by attribute.attnum)
    into update_list
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = to_regclass(format('public.%I', table_name))
      and attribute.attnum > 0
      and not attribute.attisdropped
      and attribute.attgenerated = ''
      and attribute.attname <> all(string_to_array(replace(conflict_columns, '"', ''), ', '));

    execute format(
      'insert into public.%1$I (%2$s) overriding system value '
      'select %2$s from jsonb_populate_recordset(null::public.%1$I, $1) '
      'on conflict (%3$s) do %4$s',
      table_name,
      column_list,
      conflict_columns,
      case when update_list is null then 'nothing' else 'update set ' || update_list end
    ) using table_rows;

    restored_counts := restored_counts || jsonb_build_object(table_name, jsonb_array_length(table_rows));
  end loop;

  return jsonb_build_object(
    'restored_at', now(),
    'mode', 'upsert',
    'counts', restored_counts
  );
end;
$$;

revoke all on function public.restore_platform_backup(jsonb) from public, anon;
grant execute on function public.restore_platform_backup(jsonb) to authenticated;
