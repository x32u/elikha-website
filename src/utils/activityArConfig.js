const ACTIVITY_AR_TAG = 'activity_ar_v1';
const CUSTOM_AR_MODEL_KEY = 'elikha_custom_ar_models_v1';
const CUSTOM_AR_MODEL_DB_NAME = 'elikha_custom_ar_models_db_v1';
const CUSTOM_AR_MODEL_DB_VERSION = 1;
const CUSTOM_AR_MODEL_DB_STORE = 'model_files';
export const AR_MODEL_LIBRARY_UPDATED_EVENT = 'elikha-ar-model-library-updated';

export const AR_OBJECT_LIBRARY = Object.freeze([
  {
    id: 'cube',
    label: 'Cube',
    kind: 'primitive',
    primitive: 'box',
    icon: '🧊',
    defaultScale: 0.36,
    color: '#ffffff',
  },
  {
    id: 'sphere',
    label: 'Sphere',
    kind: 'primitive',
    primitive: 'sphere',
    icon: '⚪',
    defaultScale: 0.32,
    color: '#ffffff',
  },
  {
    id: 'cone',
    label: 'Cone',
    kind: 'primitive',
    primitive: 'cone',
    icon: '🔺',
    defaultScale: 0.34,
    color: '#ffffff',
  },
  {
    id: 'cylinder',
    label: 'Cylinder',
    kind: 'primitive',
    primitive: 'cylinder',
    icon: '🥫',
    defaultScale: 0.32,
    color: '#ffffff',
  },
]);

const BUILT_IN_AR_MODELS = Object.freeze([
  {
    id: 'mask',
    label: 'Latin Mask',
    modelUrl: '/models/13137_LatinMask1_v1.obj',
    fileType: 'obj',
    aliases: ['latin-mask', 'kabuki-mask'],
    isCustom: false,
  },
  {
    id: 'bottle',
    label: 'Bottle',
    modelUrl: '/models/Bottle Coca-Cola N080710.3ds',
    fileType: '3ds',
    aliases: ['coca-cola-bottle'],
    isCustom: false,
  },
  {
    id: 'cactus',
    label: 'Cactus',
    modelUrl: '/models/cute_cactus.glb',
    fileType: 'glb',
    aliases: ['cute-cactus', 'cute_cactus'],
    isCustom: false,
  },
  {
    id: 'tree',
    label: 'Tree',
    modelUrl: '/models/maple_tree.glb',
    fileType: 'glb',
    aliases: ['maple-tree', 'maple_tree'],
    isCustom: false,
  },
  {
    id: 'paper-cup',
    label: 'Paper Cup',
    modelUrl: '/models/paper_cup.glb',
    fileType: 'glb',
    aliases: ['paper_cup'],
    isCustom: false,
  },
  {
    id: 'button',
    label: 'Button',
    modelUrl: '/models/simple_button.glb',
    fileType: 'glb',
    aliases: ['simple-button', 'simple_button'],
    isCustom: false,
  },
  {
    id: 'torii-shrine',
    label: 'Torii Shrine',
    modelUrl: '/models/torii shrine.glb',
    fileType: 'glb',
    aliases: ['torii', 'torii-shrine-gate'],
    isCustom: false,
  },
  {
    id: 'sarcophagus',
    label: 'Sarcophagus',
    modelUrl: '/models/sarcophagus.glb',
    fileType: 'glb',
    isCustom: false,
  },
  {
    id: 'lion',
    label: 'Lion',
    modelUrl: '/models/lion.glb',
    fileType: 'glb',
    isCustom: false,
  },
  {
    id: 'flower',
    label: 'Flower',
    modelUrl: '/models/flowers.glb',
    fileType: 'glb',
    aliases: ['flowers'],
    isCustom: false,
  },
  {
    id: 'popsicle-stick',
    label: 'Popsicle Stick',
    modelUrl: '/models/popsicle_stick.glb',
    fileType: 'glb',
    aliases: ['popsicle_stick'],
    isCustom: false,
  },
  {
    id: 'sakura-tree',
    label: 'Sakura Tree',
    modelUrl: '/models/sakura tree.glb',
    fileType: 'glb',
    aliases: ['sakura', 'sakura_tree'],
    isCustom: false,
  },
  {
    id: 'sphinx',
    label: 'Sphinx',
    modelUrl: '/models/the_great_sphinx_of_giza_-_egypt.glb',
    fileType: 'glb',
    aliases: ['great-sphinx', 'great-sphinx-of-giza', 'the-great-sphinx-of-giza-egypt'],
    isCustom: false,
  },
]);

// Backward-compatible export for code that still expects a constant.
export const AR_MODEL_LIBRARY = BUILT_IN_AR_MODELS;

const AR_OBJECT_BY_ID = new Map(AR_OBJECT_LIBRARY.map((item) => [item.id, item]));
const DEFAULT_ALLOWED_OBJECT_IDS = Object.freeze(['cube', 'sphere', 'cone']);
export const DEFAULT_PUZZLE_PIECES = 0;
export const PUZZLE_PIECE_OPTIONS = Object.freeze([0, 3, 4]);
export const DEFAULT_MODEL_ID = 'mask';

const isBrowser = typeof window !== 'undefined';
const isFileLike = (value) => isBrowser && typeof File !== 'undefined' && value instanceof File;

const slugifyId = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

// Older activities were saved from locally uploaded IndexedDB models with
// custom-* ids. Those files live in public/models now, so resolve the old ids
// back to portable built-in files instead of sending idb:// URLs to students.
const LEGACY_BUILT_IN_MODEL_ID_ALIASES = Object.freeze({
  'custom-cactus': 'cactus',
  'custom-tree': 'tree',
  'custom-maple-tree': 'tree',
  'custom-paper-cub': 'paper-cup',
  'custom-paper-cup': 'paper-cup',
  'paper-cub': 'paper-cup',
  'paper-cup': 'paper-cup',
  'custom-button': 'button',
  'custom-simple-button': 'button',
  'custom-torii-shrine': 'torii-shrine',
  'custom-torii': 'torii-shrine',
  'custom-sarcophagus': 'sarcophagus',
  'custom-lion': 'lion',
  'custom-flower': 'flower',
  'custom-flowers': 'flower',
  'custom-popsicle-stick': 'popsicle-stick',
  'custom-sakura-tree': 'sakura-tree',
  'custom-sakura': 'sakura-tree',
  'custom-sphinx': 'sphinx',
  'custom-great-sphinx': 'sphinx',
});

const normalizeModelLookupId = (value) => {
  const normalized = slugifyId(value);
  return LEGACY_BUILT_IN_MODEL_ID_ALIASES[normalized] || normalized;
};

const inferFileTypeFromPath = (path = '') => {
  const clean = String(path || '').split('?')[0].trim().toLowerCase();
  if (!clean) return 'obj';
  if (clean.endsWith('.glb')) return 'glb';
  if (clean.endsWith('.gltf')) return 'gltf';
  if (clean.endsWith('.fbx')) return 'fbx';
  if (clean.endsWith('.3ds')) return '3ds';
  return 'obj';
};

const isDataUrl = (value = '') => String(value || '').trim().startsWith('data:');
const isIdbUrl = (value = '') => String(value || '').trim().startsWith('idb://');
const toIdbUrl = (id = '') => `idb://${String(id || '').trim()}`;
const parseIdbId = (value = '') => {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (normalized.startsWith('idb://')) {
    return slugifyId(normalized.slice(6));
  }
  return slugifyId(normalized);
};

const emitModelLibraryUpdated = () => {
  if (!isBrowser) return;
  window.dispatchEvent(new Event(AR_MODEL_LIBRARY_UPDATED_EVENT));
};

const normalizeCustomModelEntry = (entry) => {
  const modelUrl = String(entry?.modelUrl || '').trim();
  if (!modelUrl) return null;

  const idSource = String(entry?.id || entry?.label || entry?.fileName || modelUrl);
  const normalizedId = slugifyId(idSource);
  if (!normalizedId) return null;
  const id = normalizedId.startsWith('custom-') ? normalizedId : `custom-${normalizedId}`;

  const label = String(entry?.label || '')
    .trim()
    .slice(0, 80);

  const fileName = String(entry?.fileName || '').trim();
  const fileTypeFromInput = String(entry?.fileType || '').trim().toLowerCase();
  const fileType = fileTypeFromInput || inferFileTypeFromPath(fileName || modelUrl);

  return {
    id,
    label: label || id.replace(/-/g, ' '),
    modelUrl,
    fileType,
    fileName: fileName || `model.${fileType}`,
    description: String(entry?.description || '').trim(),
    isCustom: true,
  };
};

const readCustomModelLibrary = () => {
  if (!isBrowser) return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_AR_MODEL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const dedupe = new Map();
    parsed
      .map(normalizeCustomModelEntry)
      .filter(Boolean)
      .forEach((entry) => dedupe.set(entry.id, entry));

    return Array.from(dedupe.values());
  } catch {
    return [];
  }
};

const writeCustomModelLibrary = (models) => {
  if (!isBrowser) return;
  try {
    window.localStorage.setItem(CUSTOM_AR_MODEL_KEY, JSON.stringify(models));
    return true;
  } catch {
    return false;
  }
};

const persistCustomModelLibrary = (models) => {
  const saved = writeCustomModelLibrary(models);
  if (!saved) return false;
  emitModelLibraryUpdated();
  return true;
};

const openModelFileDb = () =>
  new Promise((resolve, reject) => {
    if (!isBrowser || !window.indexedDB) {
      reject(new Error('IndexedDB is not available in this browser.'));
      return;
    }

    const request = window.indexedDB.open(CUSTOM_AR_MODEL_DB_NAME, CUSTOM_AR_MODEL_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CUSTOM_AR_MODEL_DB_STORE)) {
        db.createObjectStore(CUSTOM_AR_MODEL_DB_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open model file storage.'));
  });

const putModelFileBlob = async (id, blob) => {
  const modelId = slugifyId(id);
  if (!modelId || !blob) return false;

  let db;
  try {
    db = await openModelFileDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(CUSTOM_AR_MODEL_DB_STORE, 'readwrite');
      const store = tx.objectStore(CUSTOM_AR_MODEL_DB_STORE);
      store.put({
        id: modelId,
        blob,
        updated_at: Date.now(),
      });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('Failed to store model file.'));
      tx.onabort = () => reject(tx.error || new Error('Failed to store model file.'));
    });
    return true;
  } catch {
    return false;
  } finally {
    db?.close?.();
  }
};

const deleteModelFileBlob = async (id) => {
  const modelId = slugifyId(id);
  if (!modelId) return false;

  let db;
  try {
    db = await openModelFileDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(CUSTOM_AR_MODEL_DB_STORE, 'readwrite');
      const store = tx.objectStore(CUSTOM_AR_MODEL_DB_STORE);
      store.delete(modelId);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('Failed to delete model file.'));
      tx.onabort = () => reject(tx.error || new Error('Failed to delete model file.'));
    });
    return true;
  } catch {
    return false;
  } finally {
    db?.close?.();
  }
};

const readModelFileBlob = async (id) => {
  const modelId = slugifyId(id);
  if (!modelId) return null;

  let db;
  try {
    db = await openModelFileDb();
    const blob = await new Promise((resolve, reject) => {
      const tx = db.transaction(CUSTOM_AR_MODEL_DB_STORE, 'readonly');
      const store = tx.objectStore(CUSTOM_AR_MODEL_DB_STORE);
      const request = store.get(modelId);
      request.onsuccess = () => resolve(request.result?.blob || null);
      request.onerror = () => reject(request.error || new Error('Failed to read model file.'));
    });
    return blob instanceof Blob ? blob : null;
  } catch {
    return null;
  } finally {
    db?.close?.();
  }
};

export const getCustomArModels = () => readCustomModelLibrary();
export const getCustomArModelBlob = async (modelUrlOrId) => {
  const modelId = parseIdbId(modelUrlOrId);
  if (!modelId) return null;
  return readModelFileBlob(modelId);
};

const resolveCustomModelId = (modelId, models) => {
  const normalized = slugifyId(modelId);
  if (!normalized) return '';

  const candidates = new Set([normalized]);
  const withoutCustomPrefix = normalized.replace(/^custom-/, '');
  candidates.add(withoutCustomPrefix);
  candidates.add(`custom-${withoutCustomPrefix}`);

  const numberedAlias = normalized.match(/^(.*)-\d+$/);
  if (numberedAlias?.[1]) {
    const base = numberedAlias[1];
    const baseWithoutCustom = base.replace(/^custom-/, '');
    candidates.add(base);
    candidates.add(baseWithoutCustom);
    candidates.add(`custom-${baseWithoutCustom}`);
  }

  const directMatch = models.find((item) => candidates.has(item.id));
  if (directMatch) return directMatch.id;

  const slugMatch = models.find((item) => candidates.has(slugifyId(item.id)));
  return slugMatch?.id || '';
};

export const saveCustomArModel = async (model) => {
  const hasFile = isFileLike(model?.file);
  const file = hasFile ? model.file : null;
  const sourceFileName = file?.name || model?.fileName || '';
  const sourceFileType = model?.fileType || inferFileTypeFromPath(sourceFileName);
  const normalized = normalizeCustomModelEntry({
    ...model,
    modelUrl: hasFile ? toIdbUrl(model?.id || model?.label || sourceFileName || Date.now()) : model?.modelUrl,
    fileType: sourceFileType,
    fileName: sourceFileName,
  });
  if (!normalized) return { success: false, error: 'Invalid model file.' };

  const modelRecord = hasFile
    ? {
        ...normalized,
        modelUrl: toIdbUrl(normalized.id),
        fileType: inferFileTypeFromPath(sourceFileName),
        fileName: sourceFileName || `model.${inferFileTypeFromPath(sourceFileName)}`,
      }
    : normalized;

  if (hasFile) {
    const uploaded = await putModelFileBlob(modelRecord.id, file);
    if (!uploaded) {
      return { success: false, error: 'Unable to store model file in browser storage.' };
    }
  }

  const current = readCustomModelLibrary();
  const nextById = new Map(current.map((item) => [item.id, item]));
  nextById.set(modelRecord.id, modelRecord);
  const persisted = persistCustomModelLibrary(Array.from(nextById.values()));
  if (!persisted) {
    return { success: false, error: 'Unable to save model metadata to local storage.' };
  }

  return { success: true, data: modelRecord };
};

export const updateCustomArModel = async (modelId, updates = {}) => {
  const current = readCustomModelLibrary();
  const id = resolveCustomModelId(modelId, current);
  if (!id) return { success: false, error: 'Invalid model ID' };

  const existing = current.find((item) => item.id === id);
  if (!existing) return { success: false, error: 'Model not found' };

  const hasReplacementFile = isFileLike(updates?.file);
  const replacementFile = hasReplacementFile ? updates.file : null;
  const sourceFileName =
    replacementFile?.name || updates?.fileName || existing.fileName || `model.${existing.fileType || 'obj'}`;
  const sourceFileType = updates?.fileType || inferFileTypeFromPath(sourceFileName);
  const normalized = normalizeCustomModelEntry({
    ...existing,
    ...updates,
    id,
    modelUrl: hasReplacementFile ? toIdbUrl(id) : updates?.modelUrl || existing.modelUrl,
    fileType: sourceFileType,
    fileName: sourceFileName,
  });
  if (!normalized) return { success: false, error: 'Invalid model data' };

  const nextEntry = hasReplacementFile
    ? {
        ...normalized,
        modelUrl: toIdbUrl(id),
        fileType: inferFileTypeFromPath(sourceFileName),
        fileName: sourceFileName,
      }
    : normalized;

  if (hasReplacementFile) {
    const uploaded = await putModelFileBlob(id, replacementFile);
    if (!uploaded) {
      return { success: false, error: 'Unable to update model file in browser storage.' };
    }
  }

  const next = current.map((item) => (item.id === id ? normalized : item));
  const persisted = persistCustomModelLibrary(
    next.map((item) => (item.id === id ? nextEntry : item))
  );
  if (!persisted) {
    return { success: false, error: 'Unable to update model metadata.' };
  }
  return { success: true, data: nextEntry };
};

export const deleteCustomArModel = async (modelId) => {
  const current = readCustomModelLibrary();
  const id = resolveCustomModelId(modelId, current);
  if (!id) return { success: false, error: 'Invalid model ID' };

  const existing = current.find((item) => item.id === id);
  if (existing && isIdbUrl(existing.modelUrl)) {
    await deleteModelFileBlob(id);
  }

  const next = current.filter((item) => item.id !== id);
  const persisted = persistCustomModelLibrary(next);
  if (!persisted) {
    return { success: false, error: 'Unable to delete model metadata.' };
  }
  return { success: true };
};

export const getArModelLibrary = () => {
  const dedupe = new Map();

  BUILT_IN_AR_MODELS.forEach((model) => {
    dedupe.set(model.id, model);
  });

  readCustomModelLibrary().forEach((model) => {
    const canonicalId = normalizeModelLookupId(model.id);
    const canonicalModel = canonicalId ? dedupe.get(canonicalId) : null;
    if (canonicalModel && canonicalModel.isCustom === false) {
      return;
    }

    let id = model.id;
    if (dedupe.has(id)) {
      let index = 1;
      while (dedupe.has(`${id}-${index}`)) {
        index += 1;
      }
      id = `${id}-${index}`;
    }
    dedupe.set(id, {
      ...model,
      id,
    });
  });

  return Array.from(dedupe.values());
};

const getArModelById = () => {
  const modelMap = new Map();
  getArModelLibrary().forEach((model) => {
    const keys = [model.id, slugifyId(model.id), model.label, model.fileName];
    if (Array.isArray(model.aliases)) {
      keys.push(...model.aliases);
    }
    keys.forEach((key) => {
      const normalizedKey = normalizeModelLookupId(key);
      if (normalizedKey && !modelMap.has(normalizedKey)) {
        modelMap.set(normalizedKey, model);
      }
    });
  });

  Object.entries(LEGACY_BUILT_IN_MODEL_ID_ALIASES).forEach(([legacyId, canonicalId]) => {
    const model = modelMap.get(canonicalId);
    if (model) {
      modelMap.set(legacyId, model);
    }
  });

  return modelMap;
};

const sanitizeAllowedObjectIds = (ids) => {
  if (!Array.isArray(ids)) return [...DEFAULT_ALLOWED_OBJECT_IDS];
  const normalized = ids
    .map((id) => String(id || '').trim().toLowerCase())
    .filter((id) => AR_OBJECT_BY_ID.has(id));
  const unique = [...new Set(normalized)];
  return unique.length > 0 ? unique : [...DEFAULT_ALLOWED_OBJECT_IDS];
};

const sanitizeModelId = (modelId) => {
  const normalized = normalizeModelLookupId(modelId);
  if (!normalized) return DEFAULT_MODEL_ID;
  return getArModelById().has(normalized) ? normalized : DEFAULT_MODEL_ID;
};

const sanitizeModelIds = (modelIds) => {
  const source = Array.isArray(modelIds) ? modelIds : [modelIds];
  const sanitized = source.map(sanitizeModelId).filter(Boolean);
  return sanitized.length > 0 ? sanitized : [DEFAULT_MODEL_ID];
};

export const sanitizePuzzlePieces = (value) => {
  const count = Number(value);
  return count === 3 || count === 4 ? count : DEFAULT_PUZZLE_PIECES;
};

export const getArObjectDefinition = (id) => AR_OBJECT_BY_ID.get(String(id || '').trim().toLowerCase()) || null;

export const getArModelDefinition = (modelId, fallbackUrl = '', fallbackFileType = '') => {
  const modelMap = getArModelById();
  const normalizedId = normalizeModelLookupId(modelId);

  if (normalizedId && modelMap.has(normalizedId)) {
    return modelMap.get(normalizedId);
  }

  if (fallbackUrl) {
    return {
      id: normalizedId || DEFAULT_MODEL_ID,
      label: 'Custom Model',
      modelUrl: fallbackUrl,
      fileType: fallbackFileType || inferFileTypeFromPath(fallbackUrl),
      fileName: '',
      isCustom: true,
    };
  }

  return modelMap.get(DEFAULT_MODEL_ID) || BUILT_IN_AR_MODELS[0];
};

export const resolveArModelDefinitions = (modelIds) =>
  sanitizeModelIds(modelIds)
    .map((modelId) => getArModelDefinition(modelId))
    .filter(Boolean);

export const resolveArObjectDefinitions = (ids) => {
  const sanitized = sanitizeAllowedObjectIds(ids);
  return sanitized
    .map((id) => getArObjectDefinition(id))
    .filter(Boolean);
};

export const encodeActivityDescription = (
  summary = '',
  {
    instructions = '',
    allowedObjectIds = DEFAULT_ALLOWED_OBJECT_IDS,
    modelId = DEFAULT_MODEL_ID,
    modelIds,
    puzzlePieces = DEFAULT_PUZZLE_PIECES,
  } = {}
) => {
  try {
    const sanitizedModelIds = sanitizeModelIds(Array.isArray(modelIds) && modelIds.length > 0 ? modelIds : [modelId]);
    const modelDefs = sanitizedModelIds.map((id) => getArModelDefinition(id)).filter(Boolean);
    const modelDef = modelDefs[0] || getArModelDefinition(modelId);
    const payloadModelUrl = isDataUrl(modelDef?.modelUrl) ? '' : (modelDef?.modelUrl || '');
    return JSON.stringify({
      tag: ACTIVITY_AR_TAG,
      summary: typeof summary === 'string' ? summary : '',
      instructions: typeof instructions === 'string' ? instructions : '',
      allowedObjectIds: sanitizeAllowedObjectIds(allowedObjectIds),
      modelId: modelDef?.id || sanitizeModelId(modelId),
      modelIds: modelDefs.map((item) => item.id),
      models: modelDefs.map((item) => ({
        id: item.id,
        label: item.label || item.id,
        modelUrl: isDataUrl(item.modelUrl) ? '' : (item.modelUrl || ''),
        modelFileType: item.fileType || inferFileTypeFromPath(item.modelUrl),
      })),
      modelUrl: payloadModelUrl,
      modelFileType: modelDef?.fileType || inferFileTypeFromPath(payloadModelUrl),
      puzzlePieces: sanitizePuzzlePieces(puzzlePieces),
    });
  } catch (error) {
    console.error('Failed to encode activity AR payload:', error);
    return typeof summary === 'string' ? summary : '';
  }
};

const getDefaultParsePayload = (summary = '', isPayload = false) => {
  const defaultModel = getArModelDefinition(DEFAULT_MODEL_ID);
  return {
    summary,
    instructions: '',
    allowedObjectIds: [...DEFAULT_ALLOWED_OBJECT_IDS],
    modelId: defaultModel?.id || DEFAULT_MODEL_ID,
    modelIds: [defaultModel?.id || DEFAULT_MODEL_ID],
    models: defaultModel
      ? [{
          id: defaultModel.id,
          label: defaultModel.label || defaultModel.id,
          modelUrl: defaultModel.modelUrl || '',
          modelFileType: defaultModel.fileType || inferFileTypeFromPath(defaultModel.modelUrl),
        }]
      : [],
    modelUrl: defaultModel?.modelUrl || '',
    modelFileType: defaultModel?.fileType || inferFileTypeFromPath(defaultModel?.modelUrl),
    puzzlePieces: DEFAULT_PUZZLE_PIECES,
    isPayload,
  };
};

export const parseActivityDescription = (description) => {
  if (typeof description !== 'string') {
    return getDefaultParsePayload('', false);
  }

  const text = description.trim();
  if (!text.startsWith('{')) {
    return getDefaultParsePayload(description, false);
  }

  try {
    const parsed = JSON.parse(text);
    if (parsed?.tag !== ACTIVITY_AR_TAG) {
      return getDefaultParsePayload(description, false);
    }

    const rawModelUrl = typeof parsed.modelUrl === 'string' ? parsed.modelUrl.trim() : '';
    const rawModelFileType = typeof parsed.modelFileType === 'string' ? parsed.modelFileType.trim().toLowerCase() : '';
    const parsedModels = Array.isArray(parsed.models) ? parsed.models : [];
    const rawModelIds = Array.isArray(parsed.modelIds) && parsed.modelIds.length > 0
      ? parsed.modelIds
      : parsedModels.length > 0
        ? parsedModels.map((model) => model?.id)
        : [parsed.modelId];
    const modelIds = rawModelIds
      .map(normalizeModelLookupId)
      .filter(Boolean);
    const safeModelIds = modelIds.length > 0 ? modelIds : [DEFAULT_MODEL_ID];
    const models = safeModelIds.map((id, index) => {
      const rawModelAtIndex = parsedModels[index];
      const rawModel = normalizeModelLookupId(rawModelAtIndex?.id) === id
        ? rawModelAtIndex
        : parsedModels.find((item) => normalizeModelLookupId(item?.id) === id) || rawModelAtIndex;
      const rawUrl = typeof rawModel?.modelUrl === 'string' ? rawModel.modelUrl.trim() : '';
      const rawFileType = typeof rawModel?.modelFileType === 'string' ? rawModel.modelFileType.trim().toLowerCase() : '';
      const modelDef = getArModelDefinition(id, rawUrl || (index === 0 ? rawModelUrl : ''), rawFileType || (index === 0 ? rawModelFileType : ''));
      const sourceUrl = rawUrl || (index === 0 ? rawModelUrl : '');
      const modelUrl = isIdbUrl(sourceUrl) && modelDef && !modelDef.isCustom
        ? modelDef.modelUrl || ''
        : sourceUrl || modelDef?.modelUrl || '';
      const modelFileType = isIdbUrl(sourceUrl) && modelDef && !modelDef.isCustom
        ? modelDef.fileType || inferFileTypeFromPath(modelUrl)
        : rawFileType || (index === 0 ? rawModelFileType : '') || modelDef?.fileType || inferFileTypeFromPath(modelUrl);

      return {
        id: modelDef?.id || id,
        label: rawModel?.label || modelDef?.label || id,
        modelUrl,
        modelFileType,
      };
    });
    const modelDef = models[0] || getArModelDefinition(parsed.modelId, rawModelUrl, rawModelFileType);
    const sourceModelUrl = rawModelUrl || modelDef?.modelUrl || '';
    const resolvedModelUrl = isIdbUrl(sourceModelUrl) && modelDef && !modelDef.isCustom
      ? modelDef.modelUrl || ''
      : sourceModelUrl;

    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      instructions: typeof parsed.instructions === 'string' ? parsed.instructions : '',
      allowedObjectIds: sanitizeAllowedObjectIds(parsed.allowedObjectIds),
      modelId: modelDef?.id || DEFAULT_MODEL_ID,
      modelIds: models.map((item) => item.id),
      models,
      modelUrl: resolvedModelUrl,
      modelFileType: rawModelFileType || modelDef?.modelFileType || modelDef?.fileType || inferFileTypeFromPath(resolvedModelUrl),
      puzzlePieces: sanitizePuzzlePieces(parsed.puzzlePieces),
      isPayload: true,
    };
  } catch {
    return getDefaultParsePayload(description, false);
  }
};

export { DEFAULT_ALLOWED_OBJECT_IDS };
