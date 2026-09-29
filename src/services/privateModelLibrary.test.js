process.env.REACT_APP_R2_MODEL_API_URL = 'https://models.example';
const { getArModelLibrary, replaceR2ArModelLibrary } = require('../utils/activityArConfig');

const identify = (id) => window.sessionStorage.setItem('userInfo', JSON.stringify({ id }));
const car = { id: 'teacher-m-car', label: 'Car', modelUrl: 'https://models.example/models/files/teacher-m-car', ownerId: 'teacher', classes: [{ class_id: 'one', class_name: 'Arts' }] };
afterEach(() => { window.sessionStorage.clear(); replaceR2ArModelLibrary([], null); });
test('private library starts empty without bundled models', () => {
  identify('new-teacher');
  expect(getArModelLibrary()).toEqual([]);
});
test('metadata and class associations are account scoped and not persisted', () => {
  identify('teacher');
  replaceR2ArModelLibrary([car], 'teacher');
  expect(getArModelLibrary()[0].classes[0].class_name).toBe('Arts');
  expect(window.localStorage.getItem('elikha_r2_ar_models_v1')).toBeNull();
  identify('another-teacher');
  expect(getArModelLibrary()).toEqual([]);
  window.sessionStorage.clear();
  expect(getArModelLibrary()).toEqual([]);
});
