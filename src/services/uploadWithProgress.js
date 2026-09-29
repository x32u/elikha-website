// Report bytes actually sent, then wait for the server's response before success.
export const uploadWithProgress = (url, { method, headers, body, onProgress }) => new Promise((resolve, reject) => {
  const request = new XMLHttpRequest();
  request.open(method, url);
  Object.entries(headers).forEach(([key, value]) => request.setRequestHeader(key, value));
  request.timeout = 10 * 60 * 1000;
  request.upload.onprogress = (event) => onProgress?.(event.lengthComputable
    ? Math.min(100, Math.round(event.loaded / event.total * 100)) : null);
  request.upload.onload = () => onProgress?.(100);
  request.onerror = () => reject(new Error('Upload connection failed. Check your connection and try again.'));
  request.ontimeout = () => reject(new Error('Upload timed out. Check the model library before retrying.'));
  request.onabort = () => reject(new Error('Upload cancelled.'));
  request.onload = () => resolve({
    ok: request.status >= 200 && request.status < 300,
    status: request.status,
    json: async () => JSON.parse(request.responseText),
  });
  request.send(body);
});
