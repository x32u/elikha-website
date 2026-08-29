import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workerDirectory = path.resolve(scriptDirectory, '..');
const webDirectory = path.resolve(workerDirectory, '../..');
const wranglerBin = path.join(workerDirectory, 'node_modules/wrangler/bin/wrangler.js');
const bucket = 'elikha-3d-models';
const timestamp = '2026-08-09T00:00:00.000Z';

const models = [
  { id: 'mask', label: 'Latin Mask', file: '13137_LatinMask1_v1.obj', type: 'obj', size: 10565500 },
  { id: 'bottle', label: 'Bottle', file: 'Bottle Coca-Cola N080710.3ds', type: '3ds', size: 8420224 },
  { id: 'cactus', label: 'Cactus', file: 'cute_cactus.glb', type: 'glb', size: 5858836 },
  { id: 'tree', label: 'Tree', file: 'maple_tree.glb', type: 'glb', size: 4851616 },
  { id: 'paper-cup', label: 'Paper Cup', file: 'paper_cup.glb', type: 'glb', size: 2030072 },
  { id: 'button', label: 'Button', file: 'simple_button.glb', type: 'glb', size: 1549928 },
  { id: 'torii-shrine', label: 'Torii Shrine', file: 'torii shrine.glb', type: 'glb', size: 32904 },
  { id: 'sarcophagus', label: 'Sarcophagus', file: 'sarcophagus.glb', type: 'glb', size: 15007100 },
  { id: 'lion', label: 'Lion', file: 'lion.glb', type: 'glb', size: 1796652 },
  { id: 'flower', label: 'Flower', file: 'flowers.glb', type: 'glb', size: 12322540 },
  { id: 'popsicle-stick', label: 'Popsicle Stick', file: 'popsicle_stick.glb', type: 'glb', size: 185356 },
  { id: 'sakura-tree', label: 'Sakura Tree', file: 'sakura tree.glb', type: 'glb', size: 2291004 },
  { id: 'sphinx', label: 'Sphinx', file: 'the_great_sphinx_of_giza_-_egypt.glb', type: 'glb', size: 4345348 },
];

const runWrangler = (args, input) => {
  const result = spawnSync(process.execPath, [wranglerBin, ...args], {
    cwd: workerDirectory,
    env: {
      ...process.env,
      WRANGLER_LOG_PATH: '/private/tmp/elikha-wrangler-seed.log',
    },
    input,
    encoding: 'utf8',
    stdio: input === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit'],
  });

  if (result.status !== 0) process.exit(result.status ?? 1);
};

for (const model of models) {
  const sourcePath = path.join(webDirectory, 'public/models', model.file);
  const objectKey = `models/${model.id}.${model.type}`;
  const contentType = model.type === 'glb'
    ? 'model/gltf-binary'
    : model.type === 'obj'
      ? 'text/plain; charset=utf-8'
      : 'application/octet-stream';

  runWrangler([
    'r2', 'object', 'put', `${bucket}/${objectKey}`,
    '--file', sourcePath,
    '--content-type', contentType,
    '--remote',
    '--force',
  ]);

  const metadata = JSON.stringify({
    id: model.id,
    label: model.label,
    description: 'Built-in E-Likha AR model',
    fileName: model.file,
    fileType: model.type,
    objectKey,
    size: model.size,
    uploadedAt: timestamp,
    updatedAt: timestamp,
    uploadedBy: 'system',
    uploadedByRole: 'system',
    isBuiltIn: true,
    source: 'E-Likha built-in library',
    license: '',
  });

  runWrangler([
    'r2', 'object', 'put', `${bucket}/metadata/${model.id}.json`,
    '--pipe',
    '--content-type', 'application/json; charset=utf-8',
    '--remote',
    '--force',
  ], metadata);
}

console.log(`Seeded ${models.length} built-in models into ${bucket}.`);
