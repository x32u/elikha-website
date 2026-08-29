export const AUTH_EMAIL_ACTION_TYPES = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
  "reauthentication",
  "password_changed_notification",
  "email_changed_notification",
  "phone_changed_notification",
  "identity_linked_notification",
  "identity_unlinked_notification",
  "mfa_factor_enrolled_notification",
  "mfa_factor_unenrolled_notification",
] as const;

export type AuthEmailActionType = (typeof AUTH_EMAIL_ACTION_TYPES)[number];

export interface NotificationOutboxItem {
  id: string;
  notificationId: string;
  recipientId: string;
  recipientEmail: string;
  recipientName: string | null;
  type: string;
  subject: string;
  title: string;
  message: string;
  actionUrl: string | null;
  metadata: Record<string, unknown>;
  eventKey: string;
  attemptCount: number;
}

export interface AuthHookPayload {
  user: {
    id: string;
    email: string;
    newEmail: string | null;
    oldEmail: string | null;
  };
  emailData: {
    token: string;
    tokenHash: string;
    redirectTo: string;
    actionType: AuthEmailActionType;
    siteUrl: string;
    tokenNew: string;
    tokenHashNew: string;
  };
}

export interface AuthEmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface AuthEmailDelivery extends AuthEmailMessage {
  deliveryKey: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_TITLE_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 8_000;
const MAX_EVENT_KEY_LENGTH = 500;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown, maxLength: number): string | null => {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  if (!clean || clean.length > maxLength) return null;
  return clean;
};

const asOptionalString = (value: unknown, maxLength: number): string | null => {
  if (value === null || value === undefined || value === "") return null;
  return asString(value, maxLength);
};

export const isEmailAddress = (value: string): boolean =>
  value.length <= 320 && EMAIL_PATTERN.test(value);

export const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export const safeHttpUrl = (value: string, base?: string): string | null => {
  try {
    const url = base ? new URL(value, base) : new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
};

export const parseOutboxItems = (value: unknown): NotificationOutboxItem[] => {
  if (!Array.isArray(value)) {
    throw new Error("claim_notification_email_outbox returned a non-array response");
  }

  return value.map((raw, index) => {
    if (!isRecord(raw)) throw new Error(`Outbox row ${index} is not an object`);

    const id = asString(raw.id, 64);
    const notificationId = asString(raw.notification_id, 64);
    const recipientId = asString(raw.recipient_id, 64);
    const recipientEmail = asString(raw.recipient_email, 320);
    const type = asString(raw.type, 100);
    const title = asString(raw.title, MAX_TITLE_LENGTH);
    const message = asString(raw.message, MAX_MESSAGE_LENGTH);
    const eventKey = asString(raw.event_key, MAX_EVENT_KEY_LENGTH);
    const attemptCount = raw.attempt_count;

    if (
      !id ||
      !notificationId ||
      !recipientId ||
      !recipientEmail ||
      !type ||
      !title ||
      !message ||
      !eventKey ||
      !UUID_PATTERN.test(id) ||
      !UUID_PATTERN.test(notificationId) ||
      !UUID_PATTERN.test(recipientId) ||
      !isEmailAddress(recipientEmail) ||
      !Number.isInteger(attemptCount) ||
      Number(attemptCount) < 0
    ) {
      throw new Error(`Outbox row ${index} failed validation`);
    }

    const subject = asOptionalString(raw.subject, MAX_TITLE_LENGTH) ?? title;
    const recipientName = asOptionalString(raw.recipient_name, 200);
    const actionUrl = asOptionalString(raw.action_url, 2_000);

    return {
      id,
      notificationId,
      recipientId,
      recipientEmail,
      recipientName,
      type,
      subject,
      title,
      message,
      actionUrl,
      metadata: isRecord(raw.metadata) ? raw.metadata : {},
      eventKey,
      attemptCount: Number(attemptCount),
    };
  });
};

export const renderNotificationEmail = (
  item: NotificationOutboxItem,
  appBaseUrl: string,
): { subject: string; html: string; text: string } => {
  const recipient = item.recipientName ? ` ${item.recipientName}` : "";
  const actionUrl = item.actionUrl ? safeHttpUrl(item.actionUrl, appBaseUrl) : null;
  const actionHtml = actionUrl
    ? `<p style="margin:24px 0"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600">Open E-Likha</a></p>`
    : "";
  const actionText = actionUrl ? `\n\nOpen E-Likha: ${actionUrl}` : "";

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f5f3ff;font-family:Arial,sans-serif;color:#1f2937">
    <div style="max-width:600px;margin:0 auto;padding:32px 16px">
      <div style="background:#fff;border-radius:14px;padding:28px;border:1px solid #ede9fe">
        <p style="margin:0 0 18px;color:#7c3aed;font-weight:700">E-Likha</p>
        <p style="margin:0 0 16px">Hello${escapeHtml(recipient)},</p>
        <h1 style="font-size:22px;margin:0 0 12px">${escapeHtml(item.title)}</h1>
        <p style="font-size:16px;line-height:1.6;margin:0">${escapeHtml(item.message).replaceAll("\n", "<br>")}</p>
        ${actionHtml}
        <p style="font-size:12px;line-height:1.5;color:#6b7280;margin:24px 0 0">This is a transactional notification about an E-Likha account or activity.</p>
      </div>
    </div>
  </body>
</html>`;

  const text = `E-Likha\n\nHello${recipient},\n\n${item.title}\n\n${item.message}${actionText}\n\nThis is a transactional notification about an E-Likha account or activity.`;

  return { subject: item.subject, html, text };
};

const authActionType = (value: unknown): AuthEmailActionType | null =>
  typeof value === "string" && (AUTH_EMAIL_ACTION_TYPES as readonly string[]).includes(value)
    ? (value as AuthEmailActionType)
    : null;

export const parseAuthHookPayload = (value: unknown): AuthHookPayload => {
  if (!isRecord(value) || !isRecord(value.user) || !isRecord(value.email_data)) {
    throw new Error("Invalid auth hook payload");
  }

  const id = asString(value.user.id, 64);
  const email = asString(value.user.email, 320);
  const newEmail = asOptionalString(value.user.new_email, 320);
  const oldEmail = asOptionalString(value.email_data.old_email, 320);
  const token = asOptionalString(value.email_data.token, 256) ?? "";
  const tokenHash = asOptionalString(value.email_data.token_hash, 512) ?? "";
  const redirectTo = asOptionalString(value.email_data.redirect_to, 2_000) ?? "";
  const actionType = authActionType(value.email_data.email_action_type);
  const siteUrl = asOptionalString(value.email_data.site_url, 2_000) ?? "";
  const tokenNew = asOptionalString(value.email_data.token_new, 256) ?? "";
  const tokenHashNew = asOptionalString(value.email_data.token_hash_new, 512) ?? "";

  if (
    !id ||
    !UUID_PATTERN.test(id) ||
    !email ||
    !isEmailAddress(email) ||
    (newEmail && !isEmailAddress(newEmail)) ||
    (oldEmail && !isEmailAddress(oldEmail)) ||
    !actionType
  ) {
    throw new Error("Invalid auth hook email or action type");
  }

  return {
    user: { id, email, newEmail, oldEmail },
    emailData: { token, tokenHash, redirectTo, actionType, siteUrl, tokenNew, tokenHashNew },
  };
};

export const buildAuthConfirmationUrl = (
  supabaseUrl: string,
  siteUrl: string,
  tokenHash: string,
  actionType: AuthEmailActionType,
  redirectTo: string,
): string | null => {
  if (!tokenHash || tokenHash.length > 512) return null;

  if (
    !['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'].includes(actionType)
  ) {
    return null;
  }

  const base = safeHttpUrl(supabaseUrl);
  if (!base) return null;

  const redirect = safeHttpUrl(redirectTo) ?? safeHttpUrl(siteUrl);
  const verifyUrl = new URL("/auth/v1/verify", base);
  verifyUrl.searchParams.set("token", tokenHash);
  verifyUrl.searchParams.set("type", actionType);
  if (redirect) verifyUrl.searchParams.set("redirect_to", redirect);
  return verifyUrl.toString();
};

const authCopy = (type: AuthEmailActionType): { subject: string; heading: string; instruction: string } => {
  switch (type) {
    case "signup":
      return { subject: "Confirm your E-Likha account", heading: "Confirm your account", instruction: "Use the button or one-time code below to finish creating your E-Likha account." };
    case "invite":
      return { subject: "You are invited to E-Likha", heading: "Accept your invitation", instruction: "Use the button below to accept your E-Likha invitation." };
    case "magiclink":
      return { subject: "Your E-Likha sign-in link", heading: "Sign in to E-Likha", instruction: "Use this secure link or one-time code to sign in." };
    case "recovery":
      return { subject: "Reset your E-Likha password", heading: "Reset your password", instruction: "Use this secure link or one-time code to reset your password." };
    case "email_change":
      return { subject: "Confirm your E-Likha email change", heading: "Confirm your email change", instruction: "Use this secure link or one-time code to confirm the email change." };
    case "email":
      return { subject: "Your E-Likha verification code", heading: "Verify your email", instruction: "Use this secure link or one-time code to continue." };
    case "reauthentication":
      return { subject: "Your E-Likha verification code", heading: "Verify it is you", instruction: "Use this one-time code to continue the protected action." };
    case "password_changed_notification":
      return { subject: "Your E-Likha password was changed", heading: "Password changed", instruction: "The password for your E-Likha account was changed. If this was not you, contact your school administrator immediately." };
    case "email_changed_notification":
      return { subject: "Your E-Likha email was changed", heading: "Email changed", instruction: "The email address for your E-Likha account was changed. If this was not you, contact your school administrator immediately." };
    case "phone_changed_notification":
      return { subject: "Your E-Likha phone number was changed", heading: "Phone number changed", instruction: "The phone number for your E-Likha account was changed. If this was not you, contact your school administrator immediately." };
    case "identity_linked_notification":
      return { subject: "A sign-in method was linked to E-Likha", heading: "Sign-in method linked", instruction: "A new sign-in identity was linked to your E-Likha account. If this was not you, contact your school administrator immediately." };
    case "identity_unlinked_notification":
      return { subject: "A sign-in method was removed from E-Likha", heading: "Sign-in method removed", instruction: "A sign-in identity was removed from your E-Likha account. If this was not you, contact your school administrator immediately." };
    case "mfa_factor_enrolled_notification":
      return { subject: "Two-step verification was enabled on E-Likha", heading: "Two-step verification enabled", instruction: "A new two-step verification method was added to your E-Likha account. If this was not you, contact your school administrator immediately." };
    case "mfa_factor_unenrolled_notification":
      return { subject: "Two-step verification was changed on E-Likha", heading: "Two-step verification changed", instruction: "A two-step verification method was removed from your E-Likha account. If this was not you, contact your school administrator immediately." };
  }
};

const renderAuthEmail = (
  to: string,
  type: AuthEmailActionType,
  token: string,
  confirmationUrl: string | null,
): AuthEmailMessage => {
  const copy = authCopy(type);
  const button = confirmationUrl
    ? `<p style="margin:24px 0"><a href="${escapeHtml(confirmationUrl)}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600">Continue securely</a></p>`
    : "";
  const code = token
    ? `<p style="margin:20px 0 6px;color:#6b7280;font-size:13px">One-time code</p><p style="font-family:monospace;font-size:24px;letter-spacing:4px;font-weight:700;margin:0">${escapeHtml(token)}</p>`
    : "";
  const textLink = confirmationUrl ? `\n\nContinue securely: ${confirmationUrl}` : "";
  const textCode = token ? `\n\nOne-time code: ${token}` : "";

  return {
    to,
    subject: copy.subject,
    html: `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f5f3ff;font-family:Arial,sans-serif;color:#1f2937">
    <div style="max-width:600px;margin:0 auto;padding:32px 16px">
      <div style="background:#fff;border-radius:14px;padding:28px;border:1px solid #ede9fe">
        <p style="margin:0 0 18px;color:#7c3aed;font-weight:700">E-Likha</p>
        <h1 style="font-size:22px;margin:0 0 12px">${escapeHtml(copy.heading)}</h1>
        <p style="font-size:16px;line-height:1.6;margin:0">${escapeHtml(copy.instruction)}</p>
        ${button}
        ${code}
        <p style="font-size:12px;line-height:1.5;color:#6b7280;margin:24px 0 0">Do not share this link or code. You can ignore this email if you did not request it.</p>
      </div>
    </div>
  </body>
</html>`,
    text: `E-Likha\n\n${copy.heading}\n\n${copy.instruction}${textLink}${textCode}\n\nDo not share this link or code. You can ignore this email if you did not request it.`,
  };
};

export const buildAuthEmailMessages = (
  payload: AuthHookPayload,
  supabaseUrl: string,
): AuthEmailMessage[] => {
  const { user, emailData } = payload;
  const { actionType, siteUrl, redirectTo, token, tokenHash, tokenNew, tokenHashNew } = emailData;

  if (actionType === "email_change" && user.newEmail) {
    if (tokenHash && tokenHashNew) {
      return [
        renderAuthEmail(
          user.email,
          actionType,
          token,
          buildAuthConfirmationUrl(supabaseUrl, siteUrl, tokenHashNew, actionType, redirectTo),
        ),
        renderAuthEmail(
          user.newEmail,
          actionType,
          tokenNew || token,
          buildAuthConfirmationUrl(supabaseUrl, siteUrl, tokenHash, actionType, redirectTo),
        ),
      ];
    }

    return [
      renderAuthEmail(
        user.newEmail,
        actionType,
        tokenNew || token,
        buildAuthConfirmationUrl(supabaseUrl, siteUrl, tokenHash, actionType, redirectTo),
      ),
    ];
  }

  if (actionType === "email_changed_notification" && user.oldEmail) {
    return [renderAuthEmail(user.oldEmail, actionType, token, null)];
  }

  return [
    renderAuthEmail(
      user.email,
      actionType,
      token,
      buildAuthConfirmationUrl(supabaseUrl, siteUrl, tokenHash, actionType, redirectTo),
    ),
  ];
};

const authMessageTokenDiscriminator = (
  payload: AuthHookPayload,
  messageIndex: number,
  eventFingerprint: string,
): string => {
  const { actionType, tokenHash, tokenHashNew, token, tokenNew } = payload.emailData;
  if (actionType === "email_change") {
    if (tokenHash && tokenHashNew) {
      return messageIndex === 0
        ? tokenHashNew || token || eventFingerprint
        : tokenHash || tokenNew || token || eventFingerprint;
    }
    return tokenHash || tokenNew || token || eventFingerprint;
  }
  return tokenHash || token || tokenHashNew || tokenNew || eventFingerprint;
};

export const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const buildAuthEmailDeliveries = async (
  payload: AuthHookPayload,
  supabaseUrl: string,
  eventFingerprint: string = payload.emailData.actionType,
): Promise<AuthEmailDelivery[]> => {
  const messages = buildAuthEmailMessages(payload, supabaseUrl);
  return Promise.all(messages.map(async (message, index) => ({
    ...message,
    deliveryKey: `auth:${await sha256Hex([
      payload.user.id,
      payload.emailData.actionType,
      message.to.toLowerCase(),
      authMessageTokenDiscriminator(payload, index, eventFingerprint),
    ].join("|"))}`,
  })));
};

export const retryDelaySeconds = (errorCode: string | null, attemptCount: number): number | null => {
  if (errorCode === "E_DAILY_LIMIT_EXCEEDED") return 3_600;
  if (errorCode === "E_SENDER_NOT_VERIFIED" || errorCode === "E_SENDER_DOMAIN_NOT_AVAILABLE") return 21_600;
  if (
    errorCode === null ||
    errorCode === "E_RATE_LIMIT_EXCEEDED" ||
    errorCode === "E_DELIVERY_FAILED" ||
    errorCode === "E_INTERNAL_SERVER_ERROR"
  ) {
    return Math.min(3_600, 60 * 2 ** Math.min(Math.max(attemptCount - 1, 0), 6));
  }
  return null;
};
