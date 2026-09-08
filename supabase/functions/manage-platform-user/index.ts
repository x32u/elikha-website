import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2.93.3";
import {
  normalizeEmail,
  recoverPlatformRole,
  recoverProfileName,
  validateManagePlatformUserInput,
  validateSetPlatformUserStatusInput,
  type ManagePlatformUserInput,
} from "./logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

const PROFILE_COLUMNS = "id, name, email, role, avatar_url, is_active, disabled_at, disabled_by, created_at, updated_at";
const MAX_REQUEST_BYTES = 16 * 1024;
const AUTH_PAGE_SIZE = 1000;
const MAX_AUTH_PAGES = 100;

type JsonRecord = Record<string, unknown>;

const jsonResponse = (body: JsonRecord, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

const resolveKeyBundle = (name: string) => {
  const bundle = Deno.env.get(name);
  if (!bundle) return "";

  try {
    const parsed = JSON.parse(bundle);
    if (typeof parsed?.default === "string") return parsed.default;
    const first = Object.values(parsed || {}).find((value) => typeof value === "string");
    return typeof first === "string" ? first : "";
  } catch {
    return "";
  }
};

const resolvePublishableKey = () =>
  Deno.env.get("SUPABASE_ANON_KEY") ||
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ||
  resolveKeyBundle("SUPABASE_PUBLISHABLE_KEYS");

const resolveServiceRoleKey = () =>
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SECRET_KEY") ||
  resolveKeyBundle("SUPABASE_SECRET_KEYS");

const findAuthUserByEmail = async (
  admin: SupabaseClient,
  email: string,
): Promise<User | null> => {
  for (let page = 1; page <= MAX_AUTH_PAGES; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: AUTH_PAGE_SIZE,
    });
    if (error) throw error;

    const users = data?.users || [];
    const match = users.find((user) => normalizeEmail(user.email) === email);
    if (match) return match;
    if (users.length < AUTH_PAGE_SIZE) return null;
  }

  throw new Error("Auth user lookup exceeded its safe pagination limit.");
};

const loadProfile = async (admin: SupabaseClient, userId: string) => {
  const { data, error } = await admin
    .from("users")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
};

const recoverOrRejectExistingUser = async ({
  admin,
  authUser,
  request,
}: {
  admin: SupabaseClient;
  authUser: User;
  request: ManagePlatformUserInput;
}) => {
  const existingProfile = await loadProfile(admin, authUser.id);
  if (existingProfile) {
    return jsonResponse({
      success: false,
      code: "email_already_registered",
      message: "Email is already registered.",
    }, 409);
  }

  const recoveredRole = recoverPlatformRole(authUser.app_metadata);
  const profilePayload = {
    id: authUser.id,
    email: normalizeEmail(authUser.email) || request.email,
    name: recoverProfileName({
      userMetadata: authUser.user_metadata,
      requestedName: request.name,
      email: normalizeEmail(authUser.email) || request.email,
    }),
    role: recoveredRole,
  };
  const { data: profile, error: profileError } = await admin
    .from("users")
    .insert(profilePayload)
    .select(PROFILE_COLUMNS)
    .single();

  if (profileError) {
    // A concurrent request may have restored it between the read and insert.
    const concurrentProfile = await loadProfile(admin, authUser.id).catch(() => null);
    if (concurrentProfile) {
      return jsonResponse({
        success: false,
        code: "email_already_registered",
        message: "Email is already registered.",
      }, 409);
    }
    throw profileError;
  }

  return jsonResponse({
    success: true,
    status: "recovered",
    message: "The existing sign-in account was restored to User Management. Its password was not changed.",
    user: profile,
  });
};

const createNewUser = async ({
  admin,
  request,
}: {
  admin: SupabaseClient;
  request: ManagePlatformUserInput;
}) => {
  const { data: createData, error: createError } = await admin.auth.admin.createUser({
    email: request.email,
    password: request.password,
    email_confirm: true,
    user_metadata: { name: request.name },
    app_metadata: {
      platform_role: request.role,
    },
  });

  if (createError || !createData.user) {
    const code = String(createError?.code || "").toLowerCase();
    const message = String(createError?.message || "").toLowerCase();
    if (code === "user_already_exists" || message.includes("already registered")) {
      const racedUser = await findAuthUserByEmail(admin, request.email);
      if (racedUser) {
        return recoverOrRejectExistingUser({ admin, authUser: racedUser, request });
      }
      return jsonResponse({
        success: false,
        code: "email_already_registered",
        message: "Email is already registered.",
      }, 409);
    }

    console.error("Auth account creation failed", {
      code: createError?.code,
      status: createError?.status,
    });
    return jsonResponse({
      success: false,
      code: "account_creation_failed",
      message: "The user account could not be created.",
    }, 500);
  }

  const authUserId = createData.user.id;
  const { data: profile, error: profileError } = await admin
    .from("users")
    .upsert({
      id: authUserId,
      email: request.email,
      name: request.name,
      role: request.role,
    }, { onConflict: "id" })
    .select(PROFILE_COLUMNS)
    .single();

  if (profileError || !profile) {
    const { error: rollbackError } = await admin.auth.admin.deleteUser(authUserId);
    console.error("Profile creation failed after Auth account creation", {
      profileCode: profileError?.code,
      rollbackSucceeded: !rollbackError,
      rollbackCode: rollbackError?.code,
    });
    if (rollbackError) {
      return jsonResponse({
        success: false,
        code: "account_rollback_failed",
        message: "Account setup could not be completed. Please contact the system administrator.",
      }, 500);
    }
    return jsonResponse({
      success: false,
      code: "profile_creation_failed",
      message: "The account profile could not be created. No usable account was kept.",
    }, 500);
  }

  return jsonResponse({
    success: true,
    status: "created",
    message: "User account created.",
    user: profile,
  }, 201);
};

const setPlatformUserStatus = async ({
  admin,
  callerId,
  userId,
  isActive,
}: {
  admin: SupabaseClient;
  callerId: string;
  userId: string;
  isActive: boolean;
}) => {
  const target = await loadProfile(admin, userId);
  if (!target) {
    return jsonResponse({ success: false, code: "user_not_found", message: "User account was not found." }, 404);
  }
  if (!isActive && userId === callerId) {
    return jsonResponse({ success: false, code: "self_deactivation_forbidden", message: "You cannot deactivate your own account." }, 409);
  }
  if (!isActive && String(target.role || "").toLowerCase() === "superadmin") {
    const { count, error: countError } = await admin.from("users").select("id", { count: "exact", head: true })
      .eq("role", "superadmin").eq("is_active", true).neq("id", userId);
    if (countError) throw countError;
    if ((count || 0) < 1) {
      return jsonResponse({ success: false, code: "final_superadmin", message: "The final active super administrator cannot be deactivated." }, 409);
    }
  }

  const wasActive = target.is_active !== false;
  if (wasActive === isActive) {
    return jsonResponse({ success: true, status: isActive ? "active" : "inactive", message: `Account is already ${isActive ? "active" : "inactive"}.`, user: target });
  }

  const { error: authUpdateError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: isActive ? "none" : "876000h",
  });
  if (authUpdateError) {
    console.error("Auth status update failed", { code: authUpdateError.code, status: authUpdateError.status });
    return jsonResponse({ success: false, code: "auth_status_update_failed", message: "The sign-in account status could not be changed." }, 502);
  }

  const { data: updated, error: profileUpdateError } = await admin.from("users").update({
    is_active: isActive,
    disabled_at: isActive ? null : new Date().toISOString(),
    disabled_by: isActive ? null : callerId,
  }).eq("id", userId).select(PROFILE_COLUMNS).single();
  if (profileUpdateError || !updated) {
    await admin.auth.admin.updateUserById(userId, { ban_duration: wasActive ? "none" : "876000h" }).catch(() => undefined);
    throw profileUpdateError || new Error("Profile status update returned no user.");
  }

  return jsonResponse({
    success: true,
    status: isActive ? "active" : "inactive",
    message: isActive ? "User account reactivated." : "User account deactivated. Their saved data was kept.",
    user: updated,
  });
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({
      success: false,
      code: "method_not_allowed",
      message: "Method not allowed.",
    }, 405);
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return jsonResponse({
      success: false,
      code: "request_too_large",
      message: "The request body is too large.",
    }, 413);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const publishableKey = resolvePublishableKey();
  const serviceRoleKey = resolveServiceRoleKey();
  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return jsonResponse({
      success: false,
      code: "service_unavailable",
      message: "Account management is not configured.",
    }, 503);
  }

  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return jsonResponse({
      success: false,
      code: "authentication_required",
      message: "Authentication is required.",
    }, 401);
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) {
    return jsonResponse({
      success: false,
      code: "invalid_session",
      message: "The login session is invalid or expired.",
    }, 401);
  }

  const { data: callerProfile, error: callerProfileError } = await admin
    .from("users")
    .select("role, is_active")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (callerProfileError) {
    console.error("Could not verify account-management permission", {
      code: callerProfileError.code,
    });
    return jsonResponse({
      success: false,
      code: "authorization_check_failed",
      message: "Account-management permission could not be verified.",
    }, 500);
  }
  if (String(callerProfile?.role || "").trim().toLowerCase() !== "superadmin" || callerProfile?.is_active === false) {
    return jsonResponse({
      success: false,
      code: "forbidden",
      message: "Only an active super administrator can manage platform accounts.",
    }, 403);
  }

  let body: unknown;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      return jsonResponse({
        success: false,
        code: "request_too_large",
        message: "The request body is too large.",
      }, 413);
    }
    body = JSON.parse(rawBody);
  } catch {
    return jsonResponse({
      success: false,
      code: "invalid_json",
      message: "A JSON request body is required.",
    }, 400);
  }

  const bodyRecord = body && typeof body === "object" && !Array.isArray(body) ? body as JsonRecord : {};
  if (bodyRecord.action === "set_status") {
    const statusValidation = validateSetPlatformUserStatusInput(body);
    if (!statusValidation.ok) {
      return jsonResponse({ success: false, code: "validation_failed", message: statusValidation.message }, 400);
    }
    try {
      return await setPlatformUserStatus({
        admin,
        callerId: authData.user.id,
        userId: statusValidation.value.userId,
        isActive: statusValidation.value.isActive,
      });
    } catch (error) {
      console.error("Platform account status change failed", {
        name: error instanceof Error ? error.name : "UnknownError",
        code: typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : undefined,
      });
      return jsonResponse({ success: false, code: "status_change_failed", message: "The account status could not be changed." }, 500);
    }
  }

  const validation = validateManagePlatformUserInput(body);
  if (!validation.ok) {
    return jsonResponse({
      success: false,
      code: "validation_failed",
      message: validation.message,
    }, 400);
  }

  try {
    const existingAuthUser = await findAuthUserByEmail(admin, validation.value.email);
    if (existingAuthUser) {
      return await recoverOrRejectExistingUser({
        admin,
        authUser: existingAuthUser,
        request: validation.value,
      });
    }

    return await createNewUser({
      admin,
      request: validation.value,
    });
  } catch (error) {
    console.error("Platform account management failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      code: typeof (error as { code?: unknown })?.code === "string"
        ? (error as { code: string }).code
        : undefined,
    });
    return jsonResponse({
      success: false,
      code: "account_management_failed",
      message: "The account could not be created or restored.",
    }, 500);
  }
});
