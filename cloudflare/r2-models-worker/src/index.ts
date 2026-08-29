interface Env {
  MODEL_BUCKET: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  ALLOWED_ORIGINS: string;
  MODEL_STORAGE_CAPACITY_BYTES: string;
  MAX_MODEL_FILE_BYTES: string;
}

interface ModelMetadata {
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
  source?: string;
  license?: string;
}

interface AuthenticatedUser {
  id: string;
  role: "teacher" | "admin" | "superadmin";
}

const METADATA_PREFIX = "metadata/";
const MODEL_PREFIX = "models/";
const SUPPORTED_EXTENSIONS = new Set(["obj", "3ds", "glb", "blend"]);
const MUTATION_ROLES = new Set(["teacher", "admin", "superadmin"]);
const DEFAULT_CAPACITY_BYTES = 1024 * 1024 * 1024;
const DEFAULT_MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_METADATA_BYTES = 16 * 1024;

class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

const toPositiveInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const normalizeRole = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, "");

const getExtension = (fileName: string): string => {
  const clean = fileName.trim().toLowerCase();
  const index = clean.lastIndexOf(".");
  return index >= 0 ? clean.slice(index + 1) : "";
};

const getContentType = (extension: string): string => {
  if (extension === "glb") return "model/gltf-binary";
  if (extension === "obj") return "text/plain; charset=utf-8";
  if (extension === "3ds" || extension === "blend") return "application/octet-stream";
  return "application/octet-stream";
};

const sanitizeFileName = (value: string): string => {
  const decoded = value.trim().slice(0, 180);
  const safe = decoded.replace(/[\\/\u0000-\u001f\u007f]/g, "_");
  return safe || "model.glb";
};

const decodeHeader = (request: Request, name: string, maxLength: number): string => {
  const raw = request.headers.get(name) ?? "";
  try {
    return decodeURIComponent(raw).trim().slice(0, maxLength);
  } catch {
    throw new ApiError(400, "INVALID_HEADER", `Invalid ${name} header.`);
  }
};

const metadataKey = (id: string): string => `${METADATA_PREFIX}${id}.json`;

const getAllowedOrigin = (request: Request, env: Env): string | null => {
  const origin = request.headers.get("Origin");
  if (!origin) return null;

  const allowed = new Set(
    String(env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
  return allowed.has(origin) ? origin : null;
};

const applyCors = (request: Request, env: Env, headers: Headers): void => {
  const origin = getAllowedOrigin(request, env);
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
  }
  headers.append("Vary", "Origin");
};

const jsonResponse = (
  request: Request,
  env: Env,
  body: unknown,
  status = 200,
  extraHeaders?: HeadersInit,
): Response => {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-Content-Type-Options", "nosniff");
  applyCors(request, env, headers);
  return new Response(JSON.stringify(body), { status, headers });
};

const errorResponse = (request: Request, env: Env, error: unknown): Response => {
  if (error instanceof ApiError) {
    return jsonResponse(
      request,
      env,
      { success: false, error: error.message, code: error.code },
      error.status,
    );
  }

  console.error("Unexpected R2 model service error", error);
  return jsonResponse(
    request,
    env,
    { success: false, error: "An unexpected server error occurred.", code: "INTERNAL_ERROR" },
    500,
  );
};

const handleOptions = (request: Request, env: Env): Response => {
  const origin = request.headers.get("Origin");
  if (origin && !getAllowedOrigin(request, env)) {
    return jsonResponse(request, env, { success: false, error: "Origin is not allowed." }, 403);
  }

  const headers = new Headers({
    "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, Content-Length, X-Model-Name, X-Model-Description, X-Model-File-Name",
    "Access-Control-Max-Age": "86400",
  });
  applyCors(request, env, headers);
  return new Response(null, { status: 204, headers });
};

const requireAllowedOrigin = (request: Request, env: Env): void => {
  const origin = request.headers.get("Origin");
  if (origin && !getAllowedOrigin(request, env)) {
    throw new ApiError(403, "ORIGIN_NOT_ALLOWED", "This website origin is not allowed to change models.");
  }
};

const readBearerToken = (request: Request): string => {
  const authorization = request.headers.get("Authorization") ?? "";
  const [scheme, token] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new ApiError(401, "AUTH_REQUIRED", "Sign in before managing 3D models.");
  }
  return token;
};

const authenticateMutation = async (request: Request, env: Env): Promise<AuthenticatedUser> => {
  requireAllowedOrigin(request, env);
  const token = readBearerToken(request);
  const authHeaders = {
    apikey: env.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
  };

  const authResponse = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`, {
    headers: authHeaders,
  });
  if (!authResponse.ok) {
    throw new ApiError(401, "INVALID_SESSION", "Your session has expired. Sign in again.");
  }

  const authUser = (await authResponse.json()) as { id?: unknown };
  const userId = String(authUser.id ?? "").trim();
  if (!userId) {
    throw new ApiError(401, "INVALID_SESSION", "Unable to identify the signed-in user.");
  }

  const profileUrl = new URL(`${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/users`);
  profileUrl.searchParams.set("id", `eq.${userId}`);
  profileUrl.searchParams.set("select", "role");
  profileUrl.searchParams.set("limit", "1");

  const profileResponse = await fetch(profileUrl, { headers: authHeaders });
  if (!profileResponse.ok) {
    console.error("Supabase role lookup failed", profileResponse.status, await profileResponse.text());
    throw new ApiError(403, "ROLE_LOOKUP_FAILED", "Unable to confirm your E-Likha role.");
  }

  const profiles = (await profileResponse.json()) as Array<{ role?: unknown }>;
  const role = normalizeRole(profiles[0]?.role);
  if (!MUTATION_ROLES.has(role)) {
    throw new ApiError(403, "ROLE_NOT_ALLOWED", "Only teachers and administrators can manage 3D models.");
  }

  return { id: userId, role: role as AuthenticatedUser["role"] };
};

const listAllObjects = async (bucket: R2Bucket, prefix: string): Promise<R2Object[]> => {
  const objects: R2Object[] = [];
  let cursor: string | undefined;

  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000 });
    objects.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  return objects;
};

const readMetadata = async (bucket: R2Bucket, id: string): Promise<ModelMetadata | null> => {
  const object = await bucket.get(metadataKey(id));
  if (!object) return null;
  if (object.size > MAX_METADATA_BYTES) {
    console.error("Rejected oversized model metadata", id, object.size);
    return null;
  }

  try {
    return await object.json<ModelMetadata>();
  } catch (error) {
    console.error("Invalid model metadata JSON", id, error);
    return null;
  }
};

const writeMetadata = async (bucket: R2Bucket, metadata: ModelMetadata): Promise<void> => {
  const payload = JSON.stringify(metadata);
  if (new TextEncoder().encode(payload).byteLength > MAX_METADATA_BYTES) {
    throw new ApiError(400, "METADATA_TOO_LARGE", "Model name or description is too long.");
  }
  await bucket.put(metadataKey(metadata.id), payload, {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
};

const getModelUsage = async (env: Env): Promise<{ usedBytes: number; fileCount: number }> => {
  const objects = await listAllObjects(env.MODEL_BUCKET, MODEL_PREFIX);
  return {
    usedBytes: objects.reduce((total, object) => total + object.size, 0),
    fileCount: objects.length,
  };
};

const getCapacity = (env: Env): number =>
  toPositiveInteger(env.MODEL_STORAGE_CAPACITY_BYTES, DEFAULT_CAPACITY_BYTES);

const getMaxFileSize = (env: Env): number =>
  toPositiveInteger(env.MAX_MODEL_FILE_BYTES, DEFAULT_MAX_FILE_BYTES);

const ensureCapacity = async (env: Env, incomingBytes: number, replacingBytes = 0): Promise<void> => {
  const usage = await getModelUsage(env);
  const projected = Math.max(0, usage.usedBytes - replacingBytes) + incomingBytes;
  if (projected > getCapacity(env)) {
    throw new ApiError(
      507,
      "STORAGE_CAPACITY_REACHED",
      "The 1 GB 3D-model storage is full. Delete an unused model before uploading another.",
    );
  }
};

const ensureCurrentUsageWithinCapacity = async (env: Env, replacingBytes = 0): Promise<void> => {
  const usage = await getModelUsage(env);
  const finalUsage = Math.max(0, usage.usedBytes - replacingBytes);
  if (finalUsage > getCapacity(env)) {
    throw new ApiError(
      507,
      "STORAGE_CAPACITY_REACHED",
      "The 1 GB 3D-model storage is full. Delete an unused model before uploading another.",
    );
  }
};

const toPublicModel = (metadata: ModelMetadata, request: Request): Record<string, unknown> => ({
  id: metadata.id,
  label: metadata.label,
  description: metadata.description,
  fileName: metadata.fileName,
  fileType: metadata.fileType,
  size: metadata.size,
  uploadedAt: metadata.uploadedAt,
  updatedAt: metadata.updatedAt,
  uploadedByRole: metadata.uploadedByRole,
  isBuiltIn: metadata.isBuiltIn,
  isCustom: !metadata.isBuiltIn,
  source: metadata.source ?? "E-Likha",
  license: metadata.license ?? "",
  modelUrl: `${new URL(request.url).origin}/models/files/${encodeURIComponent(metadata.id)}?v=${encodeURIComponent(metadata.updatedAt)}`,
});

const listModels = async (request: Request, env: Env): Promise<Response> => {
  const entries = await listAllObjects(env.MODEL_BUCKET, METADATA_PREFIX);
  const models = (
    await Promise.all(
      entries.map(async (entry) => {
        const id = entry.key.slice(METADATA_PREFIX.length).replace(/\.json$/i, "");
        return readMetadata(env.MODEL_BUCKET, id);
      }),
    )
  )
    .filter((item): item is ModelMetadata => Boolean(item))
    .sort((left, right) => {
      if (left.isBuiltIn !== right.isBuiltIn) return left.isBuiltIn ? -1 : 1;
      return left.label.localeCompare(right.label);
    })
    .map((item) => toPublicModel(item, request));

  return jsonResponse(request, env, { success: true, data: models }, 200, {
    "Cache-Control": "no-store",
  });
};

const storageUsage = async (request: Request, env: Env): Promise<Response> => {
  const usage = await getModelUsage(env);
  const metadataObjects = await listAllObjects(env.MODEL_BUCKET, METADATA_PREFIX);
  const metadata = (
    await Promise.all(
      metadataObjects.map((entry) => {
        const id = entry.key.slice(METADATA_PREFIX.length).replace(/\.json$/i, "");
        return readMetadata(env.MODEL_BUCKET, id);
      }),
    )
  ).filter((item): item is ModelMetadata => Boolean(item));
  const capacityBytes = getCapacity(env);
  const remainingBytes = Math.max(capacityBytes - usage.usedBytes, 0);
  const usedPercent = capacityBytes > 0 ? Math.min(100, (usage.usedBytes / capacityBytes) * 100) : 0;

  return jsonResponse(
    request,
    env,
    {
      success: true,
      data: {
        ...usage,
        modelCount: metadata.length,
        builtInCount: metadata.filter((item) => item.isBuiltIn).length,
        customCount: metadata.filter((item) => !item.isBuiltIn).length,
        capacityBytes,
        remainingBytes,
        usedPercent,
      },
    },
    200,
    { "Cache-Control": "no-store" },
  );
};

const serveModelFile = async (request: Request, env: Env, id: string): Promise<Response> => {
  const metadata = await readMetadata(env.MODEL_BUCKET, id);
  if (!metadata) {
    throw new ApiError(404, "MODEL_NOT_FOUND", "3D model not found.");
  }

  const rangeHeader = request.headers.get("Range");
  const object = await env.MODEL_BUCKET.get(
    metadata.objectKey,
    rangeHeader ? { range: request.headers } : undefined,
  );
  if (!object) {
    throw new ApiError(404, "MODEL_FILE_NOT_FOUND", "The 3D model file is missing from storage.");
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", headers.get("Content-Type") ?? getContentType(metadata.fileType));
  headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(metadata.fileName)}`);
  headers.set("Accept-Ranges", "bytes");
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=3600");
  headers.set("X-Content-Type-Options", "nosniff");

  let status = 200;
  if (rangeHeader && object.range && "offset" in object.range && "length" in object.range) {
    const offset = object.range.offset ?? 0;
    const length = object.range.length ?? object.size;
    headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set("Content-Length", String(length));
    status = 206;
  } else {
    headers.set("Content-Length", String(object.size));
  }

  applyCors(request, env, headers);
  return new Response(request.method === "HEAD" ? null : object.body, { status, headers });
};

const parseUploadHeaders = (request: Request): {
  label: string;
  description: string;
  fileName: string;
  extension: string;
  size: number;
} => {
  const label = decodeHeader(request, "X-Model-Name", 80);
  const description = decodeHeader(request, "X-Model-Description", 500);
  const fileName = sanitizeFileName(decodeHeader(request, "X-Model-File-Name", 180));
  const extension = getExtension(fileName);
  const size = Number(request.headers.get("Content-Length"));

  if (!label) throw new ApiError(400, "NAME_REQUIRED", "Model name is required.");
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new ApiError(415, "UNSUPPORTED_FILE_TYPE", "Only .obj, .3ds, .glb, and .blend files are supported.");
  }
  if (!Number.isFinite(size) || size <= 0) {
    throw new ApiError(411, "CONTENT_LENGTH_REQUIRED", "The model file size is required.");
  }

  return { label, description, fileName, extension, size };
};

const uploadNewModel = async (request: Request, env: Env): Promise<Response> => {
  const user = await authenticateMutation(request, env);
  const input = parseUploadHeaders(request);
  const maxBytes = getMaxFileSize(env);
  if (input.size > maxBytes) {
    throw new ApiError(413, "FILE_TOO_LARGE", "File is too large. Maximum supported size is 50 MB.");
  }
  if (!request.body) throw new ApiError(400, "FILE_REQUIRED", "Select a 3D model file to upload.");

  await ensureCapacity(env, input.size);
  const id = `custom-${crypto.randomUUID()}`;
  const objectKey = `${MODEL_PREFIX}${id}.${input.extension}`;
  const now = new Date().toISOString();
  const object = await env.MODEL_BUCKET.put(objectKey, request.body, {
    httpMetadata: {
      contentType: getContentType(input.extension),
      contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(input.fileName)}`,
    },
  });

  if (object.size > maxBytes) {
    await env.MODEL_BUCKET.delete(objectKey);
    throw new ApiError(413, "FILE_TOO_LARGE", "File is too large. Maximum supported size is 50 MB.");
  }

  try {
    await ensureCurrentUsageWithinCapacity(env);
    const metadata: ModelMetadata = {
      id,
      label: input.label,
      description: input.description,
      fileName: input.fileName,
      fileType: input.extension,
      objectKey,
      size: object.size,
      uploadedAt: now,
      updatedAt: now,
      uploadedBy: user.id,
      uploadedByRole: user.role,
      isBuiltIn: false,
    };
    await writeMetadata(env.MODEL_BUCKET, metadata);
    return jsonResponse(request, env, { success: true, data: toPublicModel(metadata, request) }, 201);
  } catch (error) {
    await env.MODEL_BUCKET.delete(objectKey);
    throw error;
  }
};

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readSmallJson = async (request: Request): Promise<Record<string, unknown>> => {
  const contentLength = request.headers.get("Content-Length");
  if (contentLength !== null) {
    const length = Number(contentLength);
    if (!Number.isFinite(length) || length < 0) {
      throw new ApiError(400, "INVALID_CONTENT_LENGTH", "Content-Length must be a valid byte count.");
    }
    if (length > MAX_METADATA_BYTES) {
      throw new ApiError(413, "REQUEST_TOO_LARGE", "Request data is too large.");
    }
  }

  if (!request.body) {
    throw new ApiError(400, "INVALID_JSON", "Request body must be a valid JSON object.");
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let raw = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_METADATA_BYTES) {
      try {
        await reader.cancel();
      } catch {
        // The size error below remains the actionable response even if cancellation fails.
      }
      throw new ApiError(413, "REQUEST_TOO_LARGE", "Request data is too large.");
    }
    raw += decoder.decode(value, { stream: true });
  }
  raw += decoder.decode();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
  if (!isJsonObject(parsed)) {
    throw new ApiError(400, "INVALID_JSON", "Request body must be a JSON object.");
  }
  return parsed;
};

const updateModelMetadata = async (request: Request, env: Env, id: string): Promise<Response> => {
  await authenticateMutation(request, env);
  const existing = await readMetadata(env.MODEL_BUCKET, id);
  if (!existing) throw new ApiError(404, "MODEL_NOT_FOUND", "3D model not found.");
  if (existing.isBuiltIn) {
    throw new ApiError(403, "BUILT_IN_MODEL", "Built-in models cannot be edited.");
  }

  const input = await readSmallJson(request);
  const label = String(input.label ?? "").trim().slice(0, 80);
  const description = String(input.description ?? "").trim().slice(0, 500);
  if (!label) throw new ApiError(400, "NAME_REQUIRED", "Model name is required.");

  const updated: ModelMetadata = {
    ...existing,
    label,
    description,
    updatedAt: new Date().toISOString(),
  };
  await writeMetadata(env.MODEL_BUCKET, updated);
  return jsonResponse(request, env, { success: true, data: toPublicModel(updated, request) });
};

const replaceModelFile = async (request: Request, env: Env, id: string): Promise<Response> => {
  const user = await authenticateMutation(request, env);
  const existing = await readMetadata(env.MODEL_BUCKET, id);
  if (!existing) throw new ApiError(404, "MODEL_NOT_FOUND", "3D model not found.");
  if (existing.isBuiltIn) {
    throw new ApiError(403, "BUILT_IN_MODEL", "Built-in models cannot be replaced.");
  }
  const storedExisting = await env.MODEL_BUCKET.head(existing.objectKey);
  const replacingBytes = storedExisting?.size ?? 0;

  const input = parseUploadHeaders(request);
  const maxBytes = getMaxFileSize(env);
  if (input.size > maxBytes) {
    throw new ApiError(413, "FILE_TOO_LARGE", "File is too large. Maximum supported size is 50 MB.");
  }
  if (!request.body) throw new ApiError(400, "FILE_REQUIRED", "Select a replacement model file.");

  await ensureCapacity(env, input.size, replacingBytes);
  const objectKey = `${MODEL_PREFIX}${id}-${crypto.randomUUID()}.${input.extension}`;
  const object = await env.MODEL_BUCKET.put(objectKey, request.body, {
    httpMetadata: {
      contentType: getContentType(input.extension),
      contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(input.fileName)}`,
    },
  });

  if (object.size > maxBytes) {
    await env.MODEL_BUCKET.delete(objectKey);
    throw new ApiError(413, "FILE_TOO_LARGE", "File is too large. Maximum supported size is 50 MB.");
  }

  const updated: ModelMetadata = {
    ...existing,
    label: input.label,
    description: input.description,
    fileName: input.fileName,
    fileType: input.extension,
    objectKey,
    size: object.size,
    updatedAt: new Date().toISOString(),
    uploadedBy: user.id,
    uploadedByRole: user.role,
  };

  try {
    await ensureCurrentUsageWithinCapacity(env, replacingBytes);
    await writeMetadata(env.MODEL_BUCKET, updated);
  } catch (error) {
    if (existing.objectKey !== objectKey) {
      await env.MODEL_BUCKET.delete(objectKey);
    }
    throw error;
  }

  if (existing.objectKey !== objectKey) {
    try {
      await env.MODEL_BUCKET.delete(existing.objectKey);
    } catch (error) {
      // Metadata already points to the new object. Keeping it is safer than
      // rolling back by deleting the file that readers now resolve.
      console.error("Unable to remove replaced R2 model object", existing.id, error);
    }
  }

  return jsonResponse(request, env, { success: true, data: toPublicModel(updated, request) });
};

const isAllowedImportHost = (hostname: string): boolean => {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "polyhaven.com" ||
    normalized.endsWith(".polyhaven.com") ||
    normalized === "polyhaven.org" ||
    normalized.endsWith(".polyhaven.org")
  );
};

const fetchAllowedImport = async (initialUrl: URL): Promise<Response> => {
  let current = initialUrl;

  for (let redirects = 0; redirects <= 3; redirects += 1) {
    if (current.protocol !== "https:" || !isAllowedImportHost(current.hostname)) {
      throw new ApiError(400, "SOURCE_NOT_ALLOWED", "Only HTTPS models from Poly Haven can be imported.");
    }

    const response = await fetch(current.toString(), { redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;

    const location = response.headers.get("Location");
    if (!location) {
      throw new ApiError(502, "IMPORT_FAILED", "The model provider returned an invalid redirect.");
    }
    current = new URL(location, current);
  }

  throw new ApiError(502, "IMPORT_FAILED", "The model provider redirected too many times.");
};

const importRemoteModel = async (request: Request, env: Env): Promise<Response> => {
  const user = await authenticateMutation(request, env);
  const input = await readSmallJson(request);

  let sourceUrl: URL;
  try {
    sourceUrl = new URL(String(input.sourceUrl ?? ""));
  } catch {
    throw new ApiError(400, "INVALID_SOURCE_URL", "The model source URL is invalid.");
  }
  if (sourceUrl.protocol !== "https:" || !isAllowedImportHost(sourceUrl.hostname)) {
    throw new ApiError(400, "SOURCE_NOT_ALLOWED", "Only HTTPS models from Poly Haven can be imported.");
  }

  const label = String(input.label ?? "").trim().slice(0, 80);
  const description = String(input.description ?? "").trim().slice(0, 500);
  const fileName = sanitizeFileName(String(input.fileName ?? sourceUrl.pathname.split("/").pop() ?? "model.glb"));
  const extension = getExtension(fileName);
  if (!label) throw new ApiError(400, "NAME_REQUIRED", "Model name is required.");
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new ApiError(415, "UNSUPPORTED_FILE_TYPE", "Only .obj, .3ds, .glb, and .blend files can be imported.");
  }

  const sourceResponse = await fetchAllowedImport(sourceUrl);
  if (!sourceResponse.ok || !sourceResponse.body) {
    throw new ApiError(502, "IMPORT_FAILED", "The model provider could not supply this file.");
  }
  const size = Number(sourceResponse.headers.get("Content-Length"));
  if (!Number.isFinite(size) || size <= 0) {
    throw new ApiError(502, "IMPORT_SIZE_UNKNOWN", "The model provider did not report a safe file size.");
  }
  const maxBytes = getMaxFileSize(env);
  if (size > maxBytes) {
    throw new ApiError(413, "FILE_TOO_LARGE", "This model is larger than the 50 MB upload limit.");
  }

  await ensureCapacity(env, size);
  const id = `custom-${crypto.randomUUID()}`;
  const objectKey = `${MODEL_PREFIX}${id}.${extension}`;
  const now = new Date().toISOString();
  const object = await env.MODEL_BUCKET.put(objectKey, sourceResponse.body, {
    httpMetadata: { contentType: getContentType(extension) },
  });

  if (object.size > maxBytes) {
    await env.MODEL_BUCKET.delete(objectKey);
    throw new ApiError(413, "FILE_TOO_LARGE", "This model is larger than the 50 MB upload limit.");
  }

  const metadata: ModelMetadata = {
    id,
    label,
    description,
    fileName,
    fileType: extension,
    objectKey,
    size: object.size,
    uploadedAt: now,
    updatedAt: now,
    uploadedBy: user.id,
    uploadedByRole: user.role,
    isBuiltIn: false,
    source: String(input.source ?? "Poly Haven").trim().slice(0, 80),
    license: String(input.license ?? "CC0").trim().slice(0, 40),
  };

  try {
    await ensureCurrentUsageWithinCapacity(env);
    await writeMetadata(env.MODEL_BUCKET, metadata);
    return jsonResponse(request, env, { success: true, data: toPublicModel(metadata, request) }, 201);
  } catch (error) {
    await env.MODEL_BUCKET.delete(objectKey);
    throw error;
  }
};

const deleteModel = async (request: Request, env: Env, id: string): Promise<Response> => {
  await authenticateMutation(request, env);
  const existing = await readMetadata(env.MODEL_BUCKET, id);
  if (!existing) throw new ApiError(404, "MODEL_NOT_FOUND", "3D model not found.");
  if (existing.isBuiltIn) {
    throw new ApiError(403, "BUILT_IN_MODEL", "Built-in models cannot be deleted.");
  }

  await env.MODEL_BUCKET.delete([existing.objectKey, metadataKey(id)]);
  return jsonResponse(request, env, { success: true });
};

const handleRequest = async (request: Request, env: Env): Promise<Response> => {
  if (request.method === "OPTIONS") return handleOptions(request, env);

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (request.method === "GET" && path === "/health") {
    return jsonResponse(request, env, { success: true, service: "elikha-r2-models" });
  }
  if (request.method === "GET" && path === "/models") return listModels(request, env);
  if (request.method === "GET" && path === "/storage") return storageUsage(request, env);

  const fileMatch = path.match(/^\/models\/files\/([^/]+)(?:\/.*)?$/);
  if ((request.method === "GET" || request.method === "HEAD") && fileMatch) {
    return serveModelFile(request, env, decodeURIComponent(fileMatch[1]));
  }

  if (request.method === "POST" && path === "/models") return uploadNewModel(request, env);
  if (request.method === "POST" && path === "/models/import") return importRemoteModel(request, env);

  const fileReplacementMatch = path.match(/^\/models\/([^/]+)\/file$/);
  if (request.method === "PUT" && fileReplacementMatch) {
    return replaceModelFile(request, env, decodeURIComponent(fileReplacementMatch[1]));
  }

  const modelMatch = path.match(/^\/models\/([^/]+)$/);
  if (request.method === "PATCH" && modelMatch) {
    return updateModelMetadata(request, env, decodeURIComponent(modelMatch[1]));
  }
  if (request.method === "DELETE" && modelMatch) {
    return deleteModel(request, env, decodeURIComponent(modelMatch[1]));
  }

  throw new ApiError(404, "NOT_FOUND", "Endpoint not found.");
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      return errorResponse(request, env, error);
    }
  },
} satisfies ExportedHandler<Env>;
