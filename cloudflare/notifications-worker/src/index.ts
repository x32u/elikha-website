import { Webhook } from "standardwebhooks";
import {
  buildAuthEmailDeliveries,
  isEmailAddress,
  parseAuthHookPayload,
  parseOutboxItems,
  renderNotificationEmail,
  retryDelaySeconds,
  safeHttpUrl,
  sha256Hex,
  type NotificationOutboxItem,
} from "./lib";

const MANUAL_RUN_PATH = "/internal/run";
const AUTH_EMAIL_HOOK_PATH = "/auth-email-hook";
const MAX_AUTH_HOOK_BODY_BYTES = 128 * 1024;
const MAX_RPC_RESPONSE_BYTES = 512 * 1024;
const SUPABASE_TIMEOUT_MS = 15_000;
const AUTH_RPC_TIMEOUT_MS = 900;
const AUTH_EMAIL_SEND_TIMEOUT_MS = 2_200;

interface RunSummary {
  workerId: string;
  remindersGenerated: number | null;
  claimed: number;
  delivered: number;
  failed: number;
}

interface EmailBindingError extends Error {
  code?: string;
}

class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

class DeliveryTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeliveryTimeoutError";
  }
}

const jsonResponse = (data: unknown, status = 200): Response =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    },
  });

const notFound = (): Response =>
  new Response("Not Found", {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown error";

const emailErrorCode = (error: unknown): string | null => {
  if (!(error instanceof Error)) return null;
  const code = (error as EmailBindingError).code;
  return typeof code === "string" && code.length <= 100 ? code : null;
};

const compactError = (error: unknown): string => {
  const code = emailErrorCode(error);
  const message = errorMessage(error)
    .replaceAll(/[\r\n\t]+/g, " ")
    .replaceAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .slice(0, 400);
  return code ? `${code}: ${message}` : message;
};

const normalizeSecret = (value: string | undefined): string => (value ?? "").trim();

const verifyBearerSecret = async (request: Request, expectedSecret: string): Promise<boolean> => {
  const authorization = request.headers.get("Authorization") ?? "";
  const provided = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!provided || !expectedSecret) return false;

  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expectedSecret)),
  ]);
  // workerd exposes timingSafeEqual; intersecting with lib.webworker's older
  // SubtleCrypto declaration keeps the generated runtime type precise here.
  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual(a: ArrayBuffer | ArrayBufferView, b: ArrayBuffer | ArrayBufferView): boolean;
  };
  return subtle.timingSafeEqual(providedHash, expectedHash);
};

const parsePositiveInteger = (value: string, fallback: number, maximum: number): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
};

const requireSupabaseUrl = (value: string): string => {
  const url = safeHttpUrl(value);
  if (!url) throw new Error("SUPABASE_URL is not a valid HTTP(S) URL");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new Error("SUPABASE_URL must use HTTPS outside local development");
  }
  return parsed.origin;
};

const readBoundedText = async (response: Response, maximumBytes: number): Promise<string> => {
  const contentLength = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new Error("Upstream response exceeded the size limit");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let result = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel("response too large");
        throw new Error("Upstream response exceeded the size limit");
      }
      result += decoder.decode(value, { stream: true });
    }
    result += decoder.decode();
    return result;
  } finally {
    reader.releaseLock();
  }
};

const readBoundedRequestBody = async (request: Request, maximumBytes: number): Promise<string> => {
  const contentLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new HttpError(413, "Request body is too large");
  }
  if (!request.body) throw new HttpError(400, "Request body is required");

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let result = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel("request too large");
        throw new HttpError(413, "Request body is too large");
      }
      result += decoder.decode(value, { stream: true });
    }
    result += decoder.decode();
    return result;
  } finally {
    reader.releaseLock();
  }
};

const callSupabaseRpc = async <T>(
  env: Env,
  functionName: string,
  parameters: Record<string, unknown>,
  timeoutMs = SUPABASE_TIMEOUT_MS,
): Promise<T> => {
  const supabaseUrl = requireSupabaseUrl(env.SUPABASE_URL);
  const serviceRoleKey = normalizeSecret(env.SUPABASE_SERVICE_ROLE_KEY);
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(parameters),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await readBoundedText(response, MAX_RPC_RESPONSE_BYTES);

  if (!response.ok) {
    throw new Error(`Supabase RPC ${functionName} failed with HTTP ${response.status}: ${body.slice(0, 300)}`);
  }
  if (!body) return null as T;

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(`Supabase RPC ${functionName} returned invalid JSON`);
  }
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new DeliveryTimeoutError(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
};

const reminderCount = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
  if (value && typeof value === "object") {
    for (const key of ["generated", "created", "count"]) {
      const candidate = (value as Record<string, unknown>)[key];
      if (typeof candidate === "number" && Number.isFinite(candidate)) {
        return Math.max(0, Math.trunc(candidate));
      }
    }
  }
  return null;
};

const sendOutboxItem = async (
  env: Env,
  item: NotificationOutboxItem,
  workerId: string,
): Promise<"delivered" | "failed"> => {
  let providerMessageId: string;

  try {
    const rendered = renderNotificationEmail(item, env.APP_BASE_URL);
    const result = await env.EMAIL.send({
      to: item.recipientEmail,
      from: { email: env.EMAIL_FROM_ADDRESS, name: env.EMAIL_FROM_NAME },
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      headers: {
        "X-E-Likha-Event-Key": item.eventKey.slice(0, 200),
      },
    });
    providerMessageId = result.messageId;
  } catch (error) {
    const code = emailErrorCode(error);
    const failure = compactError(error);
    const retryAfter = retryDelaySeconds(code, item.attemptCount);

    try {
      const recorded = await callSupabaseRpc<boolean>(env, "fail_notification_email", {
        p_outbox_id: item.id,
        p_error: failure,
        p_worker_id: workerId,
        p_retry_after_seconds: retryAfter,
      });
      if (recorded !== true) {
        throw new Error("Supabase rejected the email failure acknowledgement");
      }
    } catch (recordError) {
      console.error(JSON.stringify({
        event: "notification_email_failure_record_failed",
        outboxId: item.id,
        type: item.type,
        error: compactError(recordError),
        originalError: failure,
      }));
      throw recordError;
    }

    console.error(JSON.stringify({
      event: "notification_email_failed",
      outboxId: item.id,
      type: item.type,
      code,
      retryAfterSeconds: retryAfter,
      error: failure,
    }));
    return "failed";
  }

  let acknowledgementError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const recorded = await callSupabaseRpc<boolean>(env, "complete_notification_email", {
        p_outbox_id: item.id,
        p_worker_id: workerId,
        p_provider_message_id: providerMessageId,
      });
      if (recorded !== true) {
        throw new Error("Supabase rejected the email delivery acknowledgement");
      }
      acknowledgementError = null;
      break;
    } catch (error) {
      acknowledgementError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 250));
      }
    }
  }

  if (acknowledgementError) {
    console.error(JSON.stringify({
      event: "notification_email_acknowledgement_failed",
      outboxId: item.id,
      type: item.type,
      providerMessageId,
      error: compactError(acknowledgementError),
    }));
    throw acknowledgementError;
  }

  console.log(JSON.stringify({
    event: "notification_email_delivered",
    outboxId: item.id,
    type: item.type,
    providerMessageId,
  }));
  return "delivered";
};

const runNotificationCycle = async (env: Env, workerId: string): Promise<RunSummary> => {
  const reminderResult = await callSupabaseRpc<unknown>(env, "generate_parent_activity_reminders", {});
  const maximumEmails = parsePositiveInteger(env.MAX_EMAILS_PER_RUN, 20, 50);
  const claimedResult = await callSupabaseRpc<unknown>(env, "claim_notification_email_outbox", {
    p_limit: maximumEmails,
    p_worker_id: workerId,
  });
  const items = parseOutboxItems(claimedResult);

  let delivered = 0;
  let failed = 0;
  for (let offset = 0; offset < items.length; offset += 3) {
    const chunk = items.slice(offset, offset + 3);
    const outcomes = await Promise.allSettled(
      chunk.map((item) => sendOutboxItem(env, item, workerId)),
    );
    outcomes.forEach((outcome, index) => {
      if (outcome.status === "fulfilled" && outcome.value === "delivered") {
        delivered += 1;
        return;
      }
      failed += 1;
      if (outcome.status === "rejected") {
        console.error(JSON.stringify({
          event: "notification_email_item_unhandled",
          outboxId: chunk[index]?.id,
          error: compactError(outcome.reason),
        }));
      }
    });
  }

  return {
    workerId,
    remindersGenerated: reminderCount(reminderResult),
    claimed: items.length,
    delivered,
    failed,
  };
};

const handleManualRun = async (request: Request, env: Env): Promise<Response> => {
  if (request.method !== "POST") return notFound();
  const authorized = await verifyBearerSecret(request, normalizeSecret(env.MANUAL_RUN_SECRET));
  if (!authorized) return jsonResponse({ error: "Unauthorized" }, 401);

  const workerId = `manual-${crypto.randomUUID()}`;
  const summary = await runNotificationCycle(env, workerId);
  return jsonResponse({ ok: true, ...summary });
};

const handleAuthEmailHook = async (request: Request, env: Env): Promise<Response> => {
  if (request.method !== "POST") return notFound();

  const configuredSecret = normalizeSecret(env.SUPABASE_AUTH_EMAIL_HOOK_SECRET);
  if (!configuredSecret) {
    return jsonResponse({ error: { http_code: 503, message: "Auth email hook is not configured" } }, 503);
  }

  const rawBody = await readBoundedRequestBody(request, MAX_AUTH_HOOK_BODY_BYTES);
  const standardWebhookSecret = configuredSecret.replace(/^v1,whsec_/, "");
  let verifiedPayload: unknown;

  try {
    const webhook = new Webhook(standardWebhookSecret);
    const webhookHeaders: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      webhookHeaders[key] = value;
    });
    verifiedPayload = webhook.verify(rawBody, webhookHeaders);
  } catch {
    return jsonResponse({ error: { http_code: 401, message: "Invalid webhook signature" } }, 401);
  }

  const payload = parseAuthHookPayload(verifiedPayload);
  const messages = await buildAuthEmailDeliveries(
    payload,
    env.SUPABASE_URL,
    await sha256Hex(rawBody),
  );

  await Promise.all(messages.map(async (message) => {
    if (!isEmailAddress(message.to)) throw new Error("Auth email recipient is invalid");
    const claimId = crypto.randomUUID();
    const claimState = await callSupabaseRpc<string>(env, "claim_auth_email_delivery", {
      p_delivery_key: message.deliveryKey,
      p_claim_id: claimId,
    }, AUTH_RPC_TIMEOUT_MS);
    if (claimState === "sent") return;
    if (claimState === "processing") {
      throw new HttpError(503, "A matching authentication email is still being delivered");
    }
    if (claimState !== "claimed") {
      throw new Error("Supabase returned an invalid auth-email claim state");
    }

    let providerMessageId: string;
    try {
      const result = await withTimeout(env.EMAIL.send({
        to: message.to,
        from: { email: env.EMAIL_FROM_ADDRESS, name: env.EMAIL_FROM_NAME },
        subject: message.subject,
        html: message.html,
        text: message.text,
      }), AUTH_EMAIL_SEND_TIMEOUT_MS, "Auth email provider timed out");
      providerMessageId = result.messageId;
    } catch (error) {
      // A timeout has an uncertain provider outcome. Keep its short-lived claim
      // so Supabase's immediate hook retry cannot duplicate a possibly sent mail.
      if (!(error instanceof DeliveryTimeoutError)) {
        try {
          await callSupabaseRpc<boolean>(env, "release_auth_email_delivery", {
            p_delivery_key: message.deliveryKey,
            p_claim_id: claimId,
          }, AUTH_RPC_TIMEOUT_MS);
        } catch (releaseError) {
          console.error(JSON.stringify({ event: "auth_email_claim_release_failed", error: compactError(releaseError) }));
        }
      }
      throw error;
    }

    // Do not release the claim if this acknowledgement fails: the provider
    // already accepted the email, and Supabase's immediate hook retry should
    // observe the active claim instead of sending a duplicate.
    try {
      const recorded = await callSupabaseRpc<boolean>(env, "complete_auth_email_delivery", {
        p_delivery_key: message.deliveryKey,
        p_claim_id: claimId,
        p_provider_message_id: providerMessageId,
      }, AUTH_RPC_TIMEOUT_MS);
      if (recorded !== true) throw new Error("Supabase rejected the auth-email delivery acknowledgement");
    } catch (error) {
      // The provider already accepted the email, so failing the Auth action here
      // would create a delivered-but-unusable token. Keep the claim and succeed.
      console.error(JSON.stringify({
        event: "auth_email_acknowledgement_failed",
        deliveryKey: message.deliveryKey.slice(0, 80),
        error: compactError(error),
      }));
    }
  }));

  console.log(JSON.stringify({
    event: "auth_email_delivered",
    actionType: payload.emailData.actionType,
    messageCount: messages.length,
  }));
  return jsonResponse({}, 200);
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (url.pathname === MANUAL_RUN_PATH) return await handleManualRun(request, env);
      if (url.pathname === AUTH_EMAIL_HOOK_PATH) return await handleAuthEmailHook(request, env);
      return notFound();
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      console.error(JSON.stringify({
        event: "request_failed",
        path: url.pathname,
        status,
        error: compactError(error),
      }));
      if (url.pathname === AUTH_EMAIL_HOOK_PATH) {
        const hookStatus = status === 503 ? 503 : status >= 500 ? 500 : status;
        const response = jsonResponse({
          error: {
            http_code: hookStatus,
            message: hookStatus >= 500 ? "Authentication email delivery failed" : errorMessage(error),
          },
        }, hookStatus);
        if (hookStatus === 503) response.headers.set("Retry-After", "1");
        return response;
      }
      return jsonResponse({ error: status >= 500 ? "Internal server error" : errorMessage(error) }, status);
    }
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const workerId = `cron-${controller.scheduledTime}-${crypto.randomUUID()}`;
    ctx.waitUntil(
      runNotificationCycle(env, workerId)
        .then((summary) => {
          console.log(JSON.stringify({
            event: "notification_cycle_completed",
            cron: controller.cron,
            scheduledTime: controller.scheduledTime,
            ...summary,
          }));
        })
        .catch((error: unknown) => {
          console.error(JSON.stringify({
            event: "notification_cycle_failed",
            cron: controller.cron,
            scheduledTime: controller.scheduledTime,
            workerId,
            error: compactError(error),
          }));
          throw error;
        }),
    );
  },
} satisfies ExportedHandler<Env>;
