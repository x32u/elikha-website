// One-time, explicit migration. Originals are never modified. Run BEFORE
// enabling private reads. Existing manifests cause a safe stop, not overwrite.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = path.join(directory, 'node_modules/wrangler/bin/wrangler.js');
const owners = process.argv.slice(2).filter((arg) => arg !== '--apply');
if (owners.length !== 3 || owners.some((id) => !/^[0-9a-f-]{36}$/.test(id))) throw new Error('Provide the three verified teacher UUIDs. Add --apply to migrate.');
const bucket = 'elikha-3d-models';
const run = (args, input) => spawnSync(process.execPath, [bin, ...args], { cwd: directory, input, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
const response = await fetch('https://elikha-r2-models.elikha-r2-models-worker.workers.dev/models');
if (!response.ok) throw new Error('Could not read the legacy model inventory. Do not seed after private reads are deployed.');
const payload = await response.json();
if (!payload.success || !Array.isArray(payload.data) || !payload.data.length) throw new Error('Empty or invalid legacy inventory');
const models = [];
for (const model of payload.data) {
  const result = run(['r2', 'object', 'get', `${bucket}/metadata/${model.id}.json`, '--remote', '--pipe']);
  if (result.status !== 0) throw new Error(`Could not read metadata for ${model.id}: ${result.stderr}`);
  const metadata = JSON.parse(result.stdout);
  if (metadata.ownerId || !metadata.objectKey || !Number.isFinite(metadata.size)) throw new Error('Unexpected legacy metadata');
  models.push(metadata);
}
const usedBytes = models.reduce((sum, model) => sum + model.size, 0);
if (usedBytes > 15_000_000_000) throw new Error('Seed exceeds teacher allowance');
for (const owner of owners) {
  const key = `${bucket}/libraries/${owner}.json`;
  const existing = run(['r2', 'object', 'get', key, '--remote', '--pipe']);
  if (existing.status === 0) throw new Error(`Library already exists for ${owner}; refusing to overwrite.`);
  if (!/does not exist|not found|10007|404/i.test(existing.stderr + existing.stdout)) throw new Error(`Could not verify empty library: ${existing.stderr}`);
}
console.log(`Verified ${models.length} legacy models (${usedBytes} bytes) for each of ${owners.length} teachers.`);
if (!process.argv.includes('--apply')) process.exit(0);
for (const owner of owners) {
  const copies = models.map((model) => ({ ...model, id: `${owner}-m-${model.id}`, ownerId: owner, sourceModelId: model.id, uploadedBy: owner, uploadedByRole: 'teacher', isBuiltIn: false }));
  const result = run(['r2', 'object', 'put', `${bucket}/libraries/${owner}.json`, '--remote', '--pipe', '--content-type', 'application/json', '--force'], JSON.stringify({ models: copies }));
  if (result.status !== 0) throw new Error(`Migration failed for ${owner}: ${result.stderr}`);
  console.log(`Created ${copies.length} independent entries for ${owner}; original files unchanged.`);
}
