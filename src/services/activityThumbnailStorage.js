import { supabase } from '../lib/supabase';

export const ACTIVITY_THUMBNAIL_BUCKET = 'activity-thumbnails';

const DATA_URL_PATTERN = /^data:([^;,]+)(;base64)?,(.*)$/;

const sanitizeFilePart = (value) =>
  String(value || 'thumbnail')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'thumbnail';

const dataUrlToBlob = (dataUrl) => {
  const match = String(dataUrl || '').match(DATA_URL_PATTERN);
  if (!match) {
    throw new Error('Invalid thumbnail image data.');
  }

  const mimeType = match[1] || 'image/jpeg';
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || '';
  const binary = isBase64 ? atob(payload) : decodeURIComponent(payload);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return {
    blob: new Blob([bytes], { type: mimeType }),
    mimeType,
  };
};

const getExtensionForMimeType = (mimeType) => {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  return 'jpg';
};

export const isInlineThumbnailData = (url) => String(url || '').startsWith('data:image/');

export async function uploadActivityThumbnail({
  imageUrl,
  teacherId,
  fileName = 'thumbnail',
}) {
  if (!imageUrl) return null;
  if (!isInlineThumbnailData(imageUrl)) return imageUrl;
  if (!teacherId) {
    throw new Error('Missing teacher account for thumbnail upload.');
  }

  const { blob, mimeType } = dataUrlToBlob(imageUrl);
  const extension = getExtensionForMimeType(mimeType);
  const safeName = sanitizeFilePart(fileName.replace(/\.[^.]+$/, ''));
  const path = [
    teacherId,
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}.${extension}`,
  ].join('/');

  const { error } = await supabase.storage
    .from(ACTIVITY_THUMBNAIL_BUCKET)
    .upload(path, blob, {
      cacheControl: '31536000',
      contentType: mimeType,
      upsert: false,
    });

  if (error) {
    throw new Error(
      `Unable to upload thumbnail to Supabase Storage: ${error.message}. ` +
      `Make sure the "${ACTIVITY_THUMBNAIL_BUCKET}" bucket and policies are configured.`
    );
  }

  const { data } = supabase.storage
    .from(ACTIVITY_THUMBNAIL_BUCKET)
    .getPublicUrl(path);

  return data?.publicUrl || null;
}

