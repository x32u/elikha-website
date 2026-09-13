import { supabase } from '../lib/supabase';
import { deleteR2Media, resolveR2MediaUrl, uploadR2Media } from './r2MediaApi';

const BUCKET = 'class-images';
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const TARGET_DIMENSION = 640;
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export const CLASS_IMAGE_ACCEPT_ATTR = '.png,.jpg,.jpeg,.webp';

export const validateClassImageFile = (file) => {
  if (!file) return { valid: false, error: 'Choose an image to upload.' };
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return { valid: false, error: 'Use a PNG, JPG, or WebP image.' };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { valid: false, error: 'Image is too large. Maximum size is 20 MB.' };
  }
  return { valid: true };
};

const normalizeImage = (file) => new Promise((resolve) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    resolve({ blob: file, extension: (file.name.split('.').pop() || 'png').toLowerCase() });
    return;
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    try {
      const side = Math.min(image.naturalWidth, image.naturalHeight) || TARGET_DIMENSION;
      const sourceX = (image.naturalWidth - side) / 2;
      const sourceY = (image.naturalHeight - side) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = TARGET_DIMENSION;
      canvas.height = TARGET_DIMENSION;
      canvas.getContext('2d').drawImage(
        image,
        sourceX,
        sourceY,
        side,
        side,
        0,
        0,
        TARGET_DIMENSION,
        TARGET_DIMENSION
      );
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(objectUrl);
        resolve(blob
          ? { blob, extension: 'webp' }
          : { blob: file, extension: (file.name.split('.').pop() || 'png').toLowerCase() });
      }, 'image/webp', 0.88);
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

export const resolveClassImageUrl = async (storedPath = '') => {
  const value = String(storedPath || '').trim();
  const parts = value.split('/');
  const classId = value.startsWith('r2-media/classes/') ? parts[2] : value.startsWith(`${BUCKET}/`) ? parts[1] : '';
  if (!classId) return '';
  return resolveR2MediaUrl('classes', classId, value.startsWith(`${BUCKET}/`) ? value : '');
};

export const uploadClassImage = async (classId, file, previousPath = '') => {
  const safeClassId = String(classId || '').trim();
  if (!safeClassId) throw new Error('A class is required to upload an image.');

  const validation = validateClassImageFile(file);
  if (!validation.valid) throw new Error(validation.error);

  const { blob } = await normalizeImage(file);
  const objectPath = `r2-media/classes/${safeClassId}`;
  await uploadR2Media('classes', safeClassId, blob);
  const { error: classError } = await supabase
    .from('classes')
    .update({ image_url: objectPath })
    .eq('id', safeClassId);

  if (classError) {
    await deleteR2Media('classes', safeClassId).catch(() => {});
    throw classError;
  }

  return { path: objectPath, signedUrl: await resolveClassImageUrl(objectPath) };
};

export const removeClassImage = async (classId, storedPath = '') => {
  const safeClassId = String(classId || '').trim();
  if (!safeClassId) throw new Error('A class is required to remove an image.');

  const { error } = await supabase
    .from('classes')
    .update({ image_url: null })
    .eq('id', safeClassId);
  if (error) throw error;

  await deleteR2Media('classes', safeClassId).catch(() => {});
  return true;
};
