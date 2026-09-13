-- Optional class artwork used across teacher and administrator class views.
-- Files are private because class metadata can identify a learner group. The
-- object key always starts with the class UUID: <class-id>/<unique-file>.

begin;

alter table public.classes
  add column if not exists image_url text;

comment on column public.classes.image_url is
  'Private Storage object path for optional class artwork. Null uses the class initial and color fallback.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'class-images',
  'class-images',
  false,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Class images are readable by authenticated users" on storage.objects;
drop policy if exists "Class images are readable by class members" on storage.objects;
create policy "Class images are readable by class members"
on storage.objects for select to authenticated
using (
  bucket_id = 'class-images'
  and (
    public.elikha_is_admin()
    or exists (
      select 1
      from public.classes class_row
      where class_row.id::text = (storage.foldername(name))[1]
        and (
          class_row.teacher_id = (select auth.uid())
          or private.elikha_student_has_class(class_row.id)
        )
    )
  )
);

drop policy if exists "Class managers can upload class images" on storage.objects;
create policy "Class managers can upload class images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'class-images'
  and (
    public.elikha_is_admin()
    or (
      public.elikha_current_role() = 'teacher'
      and exists (
        select 1
        from public.classes class_row
        where class_row.id::text = (storage.foldername(name))[1]
          and class_row.teacher_id = (select auth.uid())
          and class_row.is_active is true
      )
    )
  )
);

drop policy if exists "Class managers can update class images" on storage.objects;
create policy "Class managers can update class images"
on storage.objects for update to authenticated
using (
  bucket_id = 'class-images'
  and (
    public.elikha_is_admin()
    or (
      public.elikha_current_role() = 'teacher'
      and exists (
        select 1
        from public.classes class_row
        where class_row.id::text = (storage.foldername(name))[1]
          and class_row.teacher_id = (select auth.uid())
      )
    )
  )
)
with check (
  bucket_id = 'class-images'
  and (
    public.elikha_is_admin()
    or (
      public.elikha_current_role() = 'teacher'
      and exists (
        select 1
        from public.classes class_row
        where class_row.id::text = (storage.foldername(name))[1]
          and class_row.teacher_id = (select auth.uid())
      )
    )
  )
);

drop policy if exists "Class managers can delete class images" on storage.objects;
create policy "Class managers can delete class images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'class-images'
  and (
    public.elikha_is_admin()
    or (
      public.elikha_current_role() = 'teacher'
      and exists (
        select 1
        from public.classes class_row
        where class_row.id::text = (storage.foldername(name))[1]
          and class_row.teacher_id = (select auth.uid())
      )
    )
  )
);

commit;
