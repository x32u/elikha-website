export interface LibraryModel {
  id: string;
  label: string;
  description: string;
  fileName: string;
  fileType: string;
  objectKey: string;
  size: number;
  uploadedAt: string;
  updatedAt: string;
  uploadedBy: string;
  uploadedByRole: string;
  isBuiltIn: boolean;
  ownerId?: string;
  sourceModelId?: string;
  archived?: boolean;
  versions?: LibraryModel[];
  source?: string;
  license?: string;
  attribution?: string;
}

export const TEACHER_CAPACITY = 15_000_000_000;
export const LIBRARY_PREFIX = 'libraries/';
export const ownerFromModelId = (id: string) => id.match(/^([0-9a-f-]{36})-m-/i)?.[1] || null;
export const libraryKey = (owner: string) => `${LIBRARY_PREFIX}${owner}.json`;

export async function readLibrary(bucket: R2Bucket, owner: string) {
  const object = await bucket.get(libraryKey(owner));
  if (!object) return { models: [] as LibraryModel[], etag: null as string | null };
  const data = await object.json<{ models: LibraryModel[] }>();
  if (!Array.isArray(data.models)) throw new Error('Invalid model library manifest');
  return { models: data.models, etag: object.etag };
}

// Count physical assets once within each teacher's allowance. Retained versions
// count too: removing a library entry must not destroy existing student artwork.
export function libraryBytes(models: LibraryModel[]): number {
  const files = new Map<string, number>();
  for (const model of models) {
    for (const version of [model, ...(model.versions || [])]) {
      files.set(version.objectKey, version.size);
    }
  }
  return [...files.values()].reduce((sum, size) => sum + size, 0);
}

export async function saveLibraryModel(bucket: R2Bucket, model: LibraryModel, previous?: LibraryModel) {
  if (!model.ownerId) throw new Error('Model owner is required');
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { models, etag } = await readLibrary(bucket, model.ownerId);
    const current = models.find((entry) => entry.id === model.id);
    if (previous && (!current || JSON.stringify(current) !== JSON.stringify(previous) || current.archived)) {
      throw new Error('MODEL_CONFLICT');
    }
    if (!previous && current) throw new Error('MODEL_CONFLICT');
    const next = models.filter((entry) => entry.id !== model.id);
    next.push(model);
    if (model.uploadedByRole === 'teacher' && libraryBytes(next) > TEACHER_CAPACITY) {
      throw new Error('TEACHER_STORAGE_FULL');
    }
    // The conditional write makes the final quota check atomic, including
    // simultaneous uploads. A failed upload never publishes its file reference.
    const result = await bucket.put(libraryKey(model.ownerId), JSON.stringify({ models: next }), {
      onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: '*' },
      httpMetadata: { contentType: 'application/json' },
    });
    if (result) return;
  }
  throw new Error('MODEL_CONFLICT');
}
