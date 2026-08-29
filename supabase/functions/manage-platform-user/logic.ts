export const PLATFORM_ROLES = [
  "student",
  "teacher",
  "parent",
  "admin",
  "superadmin",
] as const;

export type PlatformRole = typeof PLATFORM_ROLES[number];

export type ManagePlatformUserInput = {
  name: string;
  email: string;
  password: string;
  role: PlatformRole;
};

type ValidationResult =
  | { ok: true; value: ManagePlatformUserInput }
  | { ok: false; message: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const roleSet = new Set<string>(PLATFORM_ROLES);

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

export const cleanName = (value: unknown) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

export const normalizeEmail = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export const normalizePlatformRole = (value: unknown): PlatformRole | null => {
  const role = typeof value === "string" ? value.trim().toLowerCase() : "";
  return roleSet.has(role) ? role as PlatformRole : null;
};

export const validateManagePlatformUserInput = (value: unknown): ValidationResult => {
  const body = asObject(value);
  const name = cleanName(body.name);
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  const role = normalizePlatformRole(body.role);

  if (!name || !email || !password || !role) {
    return {
      ok: false,
      message: "Name, email, password, and a valid role are required.",
    };
  }
  if (name.length > 120) {
    return { ok: false, message: "Name must be 120 characters or fewer." };
  }
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return {
      ok: false,
      message: "Email format is invalid. Use a valid email like name@example.com.",
    };
  }
  if (password.length < 8) {
    return { ok: false, message: "Password must be at least 8 characters." };
  }
  if (password.length > 128) {
    return { ok: false, message: "Password must be 128 characters or fewer." };
  }

  return { ok: true, value: { name, email, password, role } };
};

// Authorization roles must never be restored from user_metadata because the
// user can edit it. Only a server-written app_metadata value is trusted.
export const recoverPlatformRole = (appMetadata: unknown): PlatformRole => {
  const metadata = asObject(appMetadata);
  return normalizePlatformRole(metadata.platform_role) || "student";
};

export const recoverProfileName = ({
  userMetadata,
  requestedName,
  email,
}: {
  userMetadata: unknown;
  requestedName: string;
  email: string;
}) => {
  const metadata = asObject(userMetadata);
  const storedName = cleanName(metadata.name);
  if (storedName) return storedName.slice(0, 120);

  const fallback = cleanName(requestedName) || normalizeEmail(email).split("@")[0] || "User";
  return fallback.slice(0, 120);
};
