export const artworkPngFilename = (name) => {
  const safe = String(name || 'artwork').normalize('NFKC')
    .split('').map((character) => character.charCodeAt(0) < 32 ? '-' : character).join('')
    .replace(/[<>:"/\\|?*]/g, '-').replace(/\s+/g, ' ').trim()
    .replace(/[. ]+$/g, '').slice(0, 120);
  return `${safe || 'artwork'}.png`;
};

// Decode the saved submission image and encode PNG bytes, rather than merely
// renaming a JPEG. Never export the activity's example/cover image instead.
export async function exportArtworkPng(url, name) {
  if (!url || !/^(https?:\/\/|data:image\/(png|jpeg|webp);base64,)/i.test(url)) {
    throw new Error('No saved artwork image is available for this submission.');
  }
  const image = new Image();
  image.crossOrigin = 'anonymous';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      image.onload = image.onerror = null;
      image.src = '';
      reject(new Error('The artwork took too long to load. Check your connection and try again.'));
    }, 30000);
    image.onload = () => { clearTimeout(timer); resolve(); };
    image.onerror = () => {
      clearTimeout(timer);
      reject(new Error('Could not load the saved artwork. Check your connection and try again.'));
    };
    image.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  if (!canvas.width || !canvas.height) throw new Error('The saved artwork image is empty.');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not prepare the PNG. Try another browser.');
  try {
    context.drawImage(image, 0, 0);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Could not create the PNG. Please try again.')), 'image/png');
    });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = artworkPngFilename(name);
    document.body.appendChild(link);
    try { link.click(); } finally {
      link.remove();
      // Safari must have time to consume the blob before it is released.
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 60000);
    }
  } catch (error) {
    if (error.name === 'SecurityError') {
      throw new Error('The image server blocked PNG export. Please contact your administrator.');
    }
    throw error;
  } finally {
    canvas.width = canvas.height = 0;
  }
}
