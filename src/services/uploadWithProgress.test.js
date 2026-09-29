import { uploadWithProgress } from './uploadWithProgress';

describe('upload transfer feedback', () => {
  let request;
  const original = global.XMLHttpRequest;
  beforeEach(() => {
    global.XMLHttpRequest = jest.fn(() => {
      request = { open: jest.fn(), setRequestHeader: jest.fn(), send: jest.fn(), upload: {} };
      return request;
    });
  });
  afterEach(() => { global.XMLHttpRequest = original; });
  test('reports bytes sent and waits for the server after 100 percent', async () => {
    const onProgress = jest.fn();
    const done = jest.fn();
    const promise = uploadWithProgress('/models', { method: 'POST', headers: {}, body: 'file', onProgress });
    promise.then(done);
    request.upload.onprogress({ lengthComputable: true, loaded: 25, total: 100 });
    expect(onProgress).toHaveBeenLastCalledWith(25);
    request.upload.onload();
    await Promise.resolve();
    expect(onProgress).toHaveBeenLastCalledWith(100);
    expect(done).not.toHaveBeenCalled();
    request.status = 201;
    request.responseText = '{"success":true}';
    request.onload();
    const response = await promise;
    expect(response.ok).toBe(true);
    expect(await response.json()).toEqual({ success: true });
  });
  test('rejects a broken connection', async () => {
    const promise = uploadWithProgress('/models', { method: 'POST', headers: {}, body: 'file' });
    request.onerror();
    await expect(promise).rejects.toThrow('Upload connection failed');
  });
  test('does not fabricate a percentage when total size is unknown', async () => {
    const onProgress = jest.fn();
    const promise = uploadWithProgress('/models', { method: 'POST', headers: {}, body: 'file', onProgress });
    request.upload.onprogress({ lengthComputable: false });
    expect(onProgress).toHaveBeenCalledWith(null);
    request.ontimeout();
    await expect(promise).rejects.toThrow('Upload timed out');
  });
});
