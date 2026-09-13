-- Accept larger source photos for profile pictures and class artwork. Both
-- browser clients resize and re-encode images before upload when supported.

update storage.buckets
set file_size_limit = 20971520
where id in ('avatars', 'class-images');
