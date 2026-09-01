-- User profile pictures (avatars).
--
-- Adds a nullable avatar_url to public.users and a private `avatars` Storage
-- bucket with Row Level Security so that:
--   * anyone signed in can READ an avatar (needed to render the photo across
--     the app on any device),
--   * a user can upload/replace/delete their OWN avatar,
--   * admins and super admins can upload/replace/delete ANY user's avatar
--     (required for "set the photo while creating a user" and for editing an
--     existing user's photo from the admin panel).
--
-- avatar_url is not a security-sensitive field, so it deliberately rides on the
-- existing public.users update paths (self-update policy + admin-manage policy +
-- the users_guard_sensitive_fields trigger, which only guards id/email/role).
-- No new users-table policy is required.
--
-- Object key convention (enforced by the policies below):
--   avatars/<user-uuid>/<filename>
-- The first path segment is the owning user's id, which is what lets a policy
-- decide whether the caller owns the object.

begin;

-- 1. Profile column ---------------------------------------------------------

alter table public.users
  add column if not exists avatar_url text;

comment on column public.users.avatar_url is
  'Public URL of the user''s profile picture in the avatars Storage bucket. Null when unset.';

-- 2. Storage bucket ---------------------------------------------------------
-- Private bucket: objects are only reachable through RLS-checked requests or
-- signed URLs, never a guessable public URL. Children''s photos should not sit
-- on an anonymously-guessable path.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  2097152, -- 2 MiB hard cap at the storage layer (client also downscales)
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 3. Storage RLS ------------------------------------------------------------
-- storage.objects already has RLS enabled by Supabase. Scope every policy to
-- the avatars bucket and to this project''s role helpers so no other bucket is
-- affected.

-- Helper: is the caller the owner of THIS object? The owning user id is the
-- first folder segment of the object name (avatars/<uid>/...).
-- storage.foldername(name) returns the path segments as a text[]; element 1 is
-- the <uid> folder.

-- READ: any authenticated user may read any avatar so the picture renders for
-- teachers, admins, and classmates. (Bucket is private, so anon cannot.)
drop policy if exists "Avatars are readable by authenticated users" on storage.objects;
create policy "Avatars are readable by authenticated users"
on storage.objects for select to authenticated
using (bucket_id = 'avatars');

-- INSERT: a user may upload into their own folder; admins/superadmins into any.
drop policy if exists "Users and admins can upload avatars" on storage.objects;
create policy "Users and admins can upload avatars"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (
    public.elikha_is_admin()
    or (storage.foldername(name))[1] = (select auth.uid())::text
  )
);

-- UPDATE: same ownership rule (replace an existing object).
drop policy if exists "Users and admins can update avatars" on storage.objects;
create policy "Users and admins can update avatars"
on storage.objects for update to authenticated
using (
  bucket_id = 'avatars'
  and (
    public.elikha_is_admin()
    or (storage.foldername(name))[1] = (select auth.uid())::text
  )
)
with check (
  bucket_id = 'avatars'
  and (
    public.elikha_is_admin()
    or (storage.foldername(name))[1] = (select auth.uid())::text
  )
);

-- DELETE: same ownership rule (remove a photo).
drop policy if exists "Users and admins can delete avatars" on storage.objects;
create policy "Users and admins can delete avatars"
on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and (
    public.elikha_is_admin()
    or (storage.foldername(name))[1] = (select auth.uid())::text
  )
);

commit;
