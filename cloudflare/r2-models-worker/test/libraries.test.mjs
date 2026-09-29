import { test } from 'node:test';
import assert from 'node:assert/strict';
import { libraryBytes, readLibrary, saveLibraryModel, TEACHER_CAPACITY } from '../src/libraries.ts';
import { build } from 'esbuild';

class Bucket {
  values = new Map();
  sequence = 0;
  async get(key) {
    const entry = this.values.get(key);
    return entry ? { etag: entry.etag, size: entry.body.length, json: async () => JSON.parse(entry.body), body: entry.body, httpEtag: entry.etag, writeHttpMetadata() {} } : null;
  }
  async put(key, body, options = {}) {
    const existing = this.values.get(key);
    if (options.onlyIf?.etagMatches && existing?.etag !== options.onlyIf.etagMatches) return null;
    if (options.onlyIf?.etagDoesNotMatch === '*' && existing) return null;
    const entry = { body: String(body), etag: String(++this.sequence) };
    this.values.set(key, entry);
    return { size: entry.body.length };
  }
  async list({ prefix = '' }) { return { truncated: false, objects: [...this.values].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ key, size: value.body.length })) }; }
}
const teacher = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const model = (id, size = 10, ownerId = teacher) => ({ id: `${ownerId}-m-${id}`, ownerId, objectKey: `models/${id}`, size, label: id, uploadedByRole: 'teacher', updatedAt: id, uploadedAt: id, fileType: 'glb', fileName: `${id}.glb`, isBuiltIn: false });

test('new teacher starts empty; shared files count once per library', async () => {
  const bucket = new Bucket();
  assert.deepEqual((await readLibrary(bucket, teacher)).models, []);
  assert.equal(libraryBytes([model('a'), { ...model('b'), objectKey: 'models/a' }]), 10);
});
test('concurrent uploads cannot exceed 15 GB', async () => {
  const bucket = new Bucket();
  const outcomes = await Promise.allSettled([saveLibraryModel(bucket, model('a', 10_000_000_000)), saveLibraryModel(bucket, model('b', 10_000_000_000))]);
  assert.equal(outcomes.filter((entry) => entry.status === 'fulfilled').length, 1);
  assert.ok(libraryBytes((await readLibrary(bucket, teacher)).models) <= TEACHER_CAPACITY);
});
test('independent teacher metadata and retained artwork files', async () => {
  const bucket = new Bucket();
  const original = model('a');
  await saveLibraryModel(bucket, original);
  await saveLibraryModel(bucket, model('a', 10, other));
  await saveLibraryModel(bucket, { ...original, archived: true, updatedAt: 'later' }, original);
  assert.equal((await readLibrary(bucket, other)).models[0].archived, undefined);
  assert.equal(libraryBytes((await readLibrary(bucket, teacher)).models), 10);
  await assert.rejects(saveLibraryModel(bucket, { ...original, label: 'stale' }, original), /MODEL_CONFLICT/);
});

const compiled = await build({ entryPoints: ['src/index.ts'], bundle: true, write: false, format: 'esm', platform: 'browser' });
const worker = (await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)).default;
test('API denies anonymous and cross-teacher reads/mutations; combines only enrolled libraries', async () => {
  const bucket = new Bucket();
  await saveLibraryModel(bucket, model('car'));
  await saveLibraryModel(bucket, model('cup', 10, other));
  const env = { MODEL_BUCKET: bucket, SUPABASE_URL: 'https://db.example', SUPABASE_ANON_KEY: 'test' };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const identity = options.headers.Authorization.replace('Bearer ', '');
    if (String(url).endsWith('/auth/v1/user')) return Response.json({ id: identity });
    if (String(url).includes('/rest/v1/users')) return Response.json([{ role: identity === 'student' ? 'student' : 'teacher', is_active: true }]);
    if (String(url).endsWith('/rpc/model_library_classes')) return Response.json([{ class_id: 'a', class_name: 'Arts', teacher_id: teacher }, { class_id: 'b', class_name: 'Crafts', teacher_id: other }]);
    if (String(url).endsWith('/rpc/can_read_activity_model')) return Response.json(false);
    throw new Error(`Unexpected request ${url}`);
  };
  const call = (path, token, method = 'GET') => worker.fetch(new Request(`https://models.example${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {} }), env, {});
  try {
    assert.equal((await call('/models')).status, 401);
    const own = await (await call('/models', teacher)).json();
    assert.deepEqual(own.data.map((entry) => entry.label), ['car']);
    assert.equal((await call(`/models/files/${other}-m-cup`, teacher)).status, 403);
    assert.equal((await call(`/models/${other}-m-cup`, teacher, 'DELETE')).status, 403);
    const student = await (await call('/models', 'student')).json();
    assert.equal(student.data.length, 2);
    assert.equal(student.data.find((entry) => entry.label === 'car').classes[0].class_name, 'Arts');
    const empty = await (await call('/models', '33333333-3333-4333-8333-333333333333')).json();
    assert.equal(empty.data.length, 0);
    assert.equal((await (await call('/storage', teacher)).json()).data.capacityBytes, TEACHER_CAPACITY);
  } finally { globalThis.fetch = originalFetch; }
});
