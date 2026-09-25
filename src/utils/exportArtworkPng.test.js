import { artworkPngFilename, exportArtworkPng } from './exportArtworkPng';

const OriginalImage = global.Image;
let image;
beforeEach(() => {
  jest.useFakeTimers();
  global.Image = class {
    constructor() { image = this; this.naturalWidth = 1280; this.naturalHeight = 720; }
    set src(value) { if (value) Promise.resolve().then(() => this.onload?.()); }
  };
});
afterEach(() => {
  global.Image = OriginalImage;
  jest.restoreAllMocks();
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

test('encodes actual PNG bytes from the saved image and downloads a safe filename', async () => {
  const drawImage = jest.fn();
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage });
  const png = new Blob(['png'], { type: 'image/png' });
  const toBlob = jest.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done) => done(png));
  URL.createObjectURL = jest.fn(() => 'blob:artwork');
  URL.revokeObjectURL = jest.fn();
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
    expect(this.download).toBe('Student 11 - Cup.png');
    expect(this.href).toBe('blob:artwork');
  });
  await exportArtworkPng('https://images.example/art.jpg', 'Student 11 - Cup');
  expect(image.crossOrigin).toBe('anonymous');
  expect(drawImage).toHaveBeenCalledWith(image, 0, 0);
  expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
  expect(URL.createObjectURL).toHaveBeenCalledWith(png);
  expect(click).toHaveBeenCalledTimes(1);
  expect(document.querySelector('a[download]')).toBeNull();
  jest.runOnlyPendingTimers();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:artwork');
});

test('rejects missing artwork instead of exporting an activity cover', async () => {
  await expect(exportArtworkPng(null, 'Cup')).rejects.toThrow('No saved artwork');
  await expect(exportArtworkPng('javascript:alert(1)', 'Cup')).rejects.toThrow('No saved artwork');
});

test('reports image loading failure', async () => {
  global.Image = class { set src(value) { if (value) Promise.resolve().then(() => this.onerror()); } };
  await expect(exportArtworkPng('https://images.example/missing.jpg')).rejects.toThrow('Could not load');
});

test('sanitizes unsafe filename characters', () => {
  expect(artworkPngFilename('Cup / Art: 1?')).toBe('Cup - Art- 1-.png');
  expect(artworkPngFilename('...')).toBe('artwork.png');
});
