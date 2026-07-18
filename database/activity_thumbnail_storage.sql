-- Supabase Storage bucket for teacher activity thumbnails.
-- Apply in Supabase SQL Editor before using activity thumbnail uploads.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'activity-thumbnails',
  'activity-thumbnails',
  true,
  8388608,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Activity thumbnails are publicly readable"
  on storage.objects;

create policy "Activity thumbnails are publicly readable"
on storage.objects
for select
to public
using (bucket_id = 'activity-thumbnails');

drop policy if exists "Teachers can upload own activity thumbnails"
  on storage.objects;

create policy "Teachers can upload own activity thumbnails"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'activity-thumbnails'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and replace(replace(replace(lower(coalesce(u.role, '')), '_', ''), '-', ''), ' ', '')
        in ('teacher', 'admin', 'superadmin')
  )
);

drop policy if exists "Teachers can update own activity thumbnails"
  on storage.objects;

create policy "Teachers can update own activity thumbnails"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'activity-thumbnails'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'activity-thumbnails'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Teachers can delete own activity thumbnails"
  on storage.objects;

create policy "Teachers can delete own activity thumbnails"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'activity-thumbnails'
  and (storage.foldername(name))[1] = auth.uid()::text
);

