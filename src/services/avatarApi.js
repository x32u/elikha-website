import { supabase } from '../lib/supabase';

// Profile-picture (avatar) service.
//
// Avatars live in a PRIVATE Supabase Storage bucket, so images are rendered
// through short-lived signed URLs, never a public link. `users.avatar_url`
// stores the object PATH (e.g. "avatars/<uid>/<file>"), not a URL — call
// resolveAvatarUrl(path) to get a displayable src.
//
// Row Level Security (see migration 20260831190000_user_avatars.sql) lets a
// user write their own folder and lets admins/superadmins write anyone's, so
// the same upload path serves self-service edits and admin management.

const BUCKET = 'avatars';
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MiB, matches the bucket limit
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
    return { valid: false, error: 'Image is too large. Maximum size is 2 MB.' };
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

  const { blob, extension } = await normalizeImage(file);
  // Deterministic single object per user keeps storage from accumulating one
  // file per edit; upsert overwrites the previous photo in place.
  const path = `${id}/avatar.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, {
      upsert: true,
      contentType: blob.type || `image/${extension}`,
      cacheControl: '3600',
    });
  if (uploadError) throw uploadError;

  const objectPath = `${BUCKET}/${path}`;
  const { error: profileError } = await supabase
    .from('users')
    .update({ avatar_url: objectPath })
    .eq('id', id);
  if (profileError) throw profileError;

  const signedUrl = await resolveAvatarUrl(objectPath);
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

  const key = stripBucketPrefix(storedPath);
  if (key) {
    // Deleting the object is best-effort: the profile no longer references it,
    // so a failed delete leaves an orphan but never a broken display.
    await supabase.storage.from(BUCKET).remove([key]).catch(() => {});
  }
  return true;
};

const stripBucketPrefix = (stored = '') => {
  const value = String(stored || '').trim();
  if (!value) return '';
  return value.startsWith(`${BUCKET}/`) ? value.slice(BUCKET.length + 1) : value;
};

// Turn a stored avatar_url (an object path) into a displayable signed URL.
// Returns '' when there is no avatar or the sign fails, so callers can fall
// back to initials.
export const resolveAvatarUrl = async (storedPath = '') => {
  const key = stripBucketPrefix(storedPath);
  if (!key) return '';
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(key, SIGNED_URL_TTL_SECONDS);
    if (error) return '';
    return data?.signedUrl || '';
  } catch {
    return '';
  }
};
