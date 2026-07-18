const MAX_THUMBNAIL_FILE_BYTES = 8 * 1024 * 1024;
const MAX_THUMBNAIL_DIMENSION = 960;
const THUMBNAIL_QUALITY = 0.82;

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Unable to read image file.'));
    reader.readAsDataURL(file);
  });

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load selected image.'));
    image.src = src;
  });

export async function createActivityThumbnailDataUrl(file) {
  if (!file) return '';

  if (!file.type?.startsWith('image/')) {
    throw new Error('Please choose an image file.');
  }

  if (file.size > MAX_THUMBNAIL_FILE_BYTES) {
    throw new Error('Thumbnail image must be 8MB or smaller.');
  }

  const sourceUrl = await readFileAsDataUrl(file);
  const image = await loadImage(sourceUrl);
  const scale = Math.min(1, MAX_THUMBNAIL_DIMENSION / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to process selected image.');
  }

  context.fillStyle = '#f7f5f3';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  return canvas.toDataURL('image/jpeg', THUMBNAIL_QUALITY);
}

