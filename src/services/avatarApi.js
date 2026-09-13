import { supabase } from '../lib/supabase';
import { deleteR2Media, resolveR2MediaUrl, uploadR2Media } from './r2MediaApi';

// Profile-picture (avatar) service.
//
// Avatars live in private Cloudflare R2 storage and are fetched with the current
// Supabase session. Legacy `avatars/...` paths are copied into R2 on first read.
//
// Row Level Security (see migration 20260831190000_user_avatars.sql) lets a
// user write their own folder and lets admins/superadmins write anyone's, so
// the same upload path serves self-service edits and admin management.

const BUCKET = 'avatars';
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MiB source limit, matches the bucket limit
const TARGET_DIMENSION = 512; // square, downscaled before upload
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export const AVATAR_ACCEPT_ATTR = '.png,.jpg,.jpeg,.webp';

const isBrowser = typeof window !== 'undefined';

// Validate a picked File before doing any work.
export const validateAvatarFile = (file) => {
  if (!file) return { valid: false, error: 'Choose an image to upload.' };
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return { valid: false, error: 'Use a PNG, JPG, or WebP image.' };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { valid: false, error: 'Image is too large. Maximum size is 20 MB.' };
  }
  return { valid: true };
};

// Downscale to a centered TARGET_DIMENSION square and re-encode as WebP so the
// stored object is small and predictable regardless of the source photo. Falls
// back to the original blob if the browser cannot run canvas (SSR/tests).
const normalizeImage = (file) =>
  new Promise((resolve) => {
    if (!isBrowser || typeof document === 'undefined' || typeof createImageBitmap === 'undefined') {
      resolve({ blob: file, extension: (file.name.split('.').pop() || 'png').toLowerCase() });
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        const side = Math.min(image.naturalWidth, image.naturalHeight) || TARGET_DIMENSION;
        const sx = (image.naturalWidth - side) / 2;
        const sy = (image.naturalHeight - side) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = TARGET_DIMENSION;
        canvas.height = TARGET_DIMENSION;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, sx, sy, side, side, 0, 0, TARGET_DIMENSION, TARGET_DIMENSION);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objectUrl);
            if (blob) {
              resolve({ blob, extension: 'webp' });
            } else {
              resolve({ blob: file, extension: (file.name.split('.').pop() || 'png').toLowerCase() });
            }
          },
          'image/webp',
          0.9
        );
      } catch {
        URL.revokeObjectURL(objectUrl);
        resolve({ blob: file, extension: (file.name.split('.').pop() || 'png').toLowerCase() });
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ blob: file, extension: (file.name.split('.').pop() || 'png').toLowerCase() });
    };
    image.src = objectUrl;
  });

// Upload (or replace) a user's avatar and persist the object path on their
// profile row. `userId` is the OWNER of the avatar — for admin-managed uploads
// it is the target user's id, not the admin's. Returns { path, signedUrl }.
export const uploadUserAvatar = async (userId, file) => {
  const id = String(userId || '').trim();
  if (!id) throw new Error('A user id is required to upload an avatar.');

  const validation = validateAvatarFile(file);
  if (!validation.valid) throw new Error(validation.error);

  const { blob } = await normalizeImage(file);
  // Deterministic single object per user keeps storage from accumulating one
  // file per edit; upsert overwrites the previous photo in place.
  const objectPath = `r2-media/avatars/${id}`;
  await uploadR2Media('avatars', id, blob);
  const { error: profileError } = await supabase
    .from('users')
    .update({ avatar_url: objectPath })
    .eq('id', id);
  if (profileError) {
    await deleteR2Media('avatars', id).catch(() => {});
    throw profileError;
  }

  const signedUrl = await resolveR2MediaUrl('avatars', id);
  return { path: objectPath, signedUrl };
};

// Remove a user's avatar: clear the profile column and delete the object.
export const removeUserAvatar = async (userId, storedPath = '') => {
  const id = String(userId || '').trim();
  if (!id) throw new Error('A user id is required to remove an avatar.');

  const { error: profileError } = await supabase
    .from('users')
    .update({ avatar_url: null })
    .eq('id', id);
  if (profileError) throw profileError;

  await deleteR2Media('avatars', id).catch(() => {});
  return true;
};

// Turn either a new R2 path or a legacy Supabase path into a displayable local
// object URL. Legacy files are copied to R2 by the Worker during this request.
export const resolveAvatarUrl = async (storedPath = '') => {
  const value = String(storedPath || '').trim();
  const parts = value.split('/');
  const id = value.startsWith('r2-media/avatars/') ? parts[2] : value.startsWith(`${BUCKET}/`) ? parts[1] : parts[0];
  if (!id) return '';
  return resolveR2MediaUrl('avatars', id, value.startsWith(`${BUCKET}/`) ? value : '');
};

// Teacher-facing lists may be allowed to read an enrolled learner's avatar
// object while RLS intentionally hides the learner's full `users` row. Resolve
// the saved path when available, then safely discover the deterministic avatar
// file inside that user's private-bucket folder.
export const resolveUserAvatarUrl = async (userId, storedPath = '') => {
  const directUrl = await resolveAvatarUrl(storedPath);
  if (directUrl) return directUrl;

  const id = String(userId || '').trim();
  if (!id) return '';
  const r2Url = await resolveR2MediaUrl('avatars', id);
  if (r2Url) return r2Url;
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(id, { limit: 10, search: 'avatar.' });
    if (error) return '';
    const avatar = (data || []).find((item) => String(item?.name || '').startsWith('avatar.'));
    if (!avatar?.name) return '';
    return resolveR2MediaUrl('avatars', id, `${BUCKET}/${id}/${avatar.name}`);
  } catch {
    return '';
  }
};
