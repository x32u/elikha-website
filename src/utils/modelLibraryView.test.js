import { selectLibraryModels, formatModelSize } from './modelLibraryView';

const models = [
  { id: 'a', label: 'Cup', fileName: 'cup.glb', fileType: 'glb', size: 1e6, uploadedAt: '2026-09-01' },
  { id: 'b', label: 'Stick', fileName: 'stick.obj', fileType: 'obj', size: 900, uploadedAt: '2026-09-28' },
  { id: 'c', label: 'Bottle', fileName: 'bottle.blend', fileType: 'blend', size: 1e7, uploadedAt: '2026-09-10' },
  { id: 'd', label: 'Unknown', size: 0, uploadedAt: '' },
];
const ids = (options) => selectLibraryModels(models, options).map((model) => model.id);
test('sorts dates, sizes and names without mutating the source', () => {
  expect(ids()).toEqual(['b', 'c', 'a', 'd']);
  expect(ids({ sort: 'oldest' })).toEqual(['a', 'c', 'b', 'd']);
  expect(ids({ sort: 'largest' })).toEqual(['c', 'a', 'b', 'd']);
  expect(ids({ sort: 'smallest' })).toEqual(['b', 'a', 'c', 'd']);
  expect(ids({ sort: 'az' })).toEqual(['c', 'a', 'b', 'd']);
  expect(ids({ sort: 'za' })).toEqual(['d', 'b', 'a', 'c']);
  expect(models.map((model) => model.id)).toEqual(['a', 'b', 'c', 'd']);
});
test('combines search, type and size with inclusive boundaries', () => {
  expect(ids({ size: 'small' })).toEqual(['b']);
  expect(ids({ size: 'medium' })).toEqual(['a']);
  expect(ids({ size: 'large' })).toEqual(['c']);
  expect(ids({ query: ' CUP.GLB ', type: 'glb', size: 'medium' })).toEqual(['a']);
  expect(ids({ query: 'Cup', type: 'obj' })).toEqual([]);
});
test('formats real bytes and does not report unknown sizes as zero', () => {
  expect(formatModelSize(models[0])).toBe('1 MB');
  expect(formatModelSize(models[1])).toBe('900 B');
  expect(formatModelSize(models[3])).toBe('Unknown');
  expect(formatModelSize({ size: -1 })).toBe('Unknown');
});
