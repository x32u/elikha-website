-- Point existing profile and class image records at the private Cloudflare R2
-- media service. The original Supabase Storage objects are deliberately kept
-- as rollback copies; the Worker copies legacy objects to R2 on first access.

update public.users
set avatar_url = 'r2-media/avatars/' || id::text,
    updated_at = now()
where avatar_url like 'avatars/' || id::text || '/%';

update public.classes
set image_url = 'r2-media/classes/' || id::text,
    updated_at = now()
where image_url like 'class-images/' || id::text || '/%';
