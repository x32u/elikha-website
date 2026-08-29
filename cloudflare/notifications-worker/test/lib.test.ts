import { describe, expect, it } from "vitest";
import {
  buildAuthConfirmationUrl,
  buildAuthEmailDeliveries,
  buildAuthEmailMessages,
  escapeHtml,
  parseAuthHookPayload,
  parseOutboxItems,
  renderNotificationEmail,
  retryDelaySeconds,
} from "../src/lib";

const OUTBOX_ID = "11111111-1111-4111-8111-111111111111";
const NOTIFICATION_ID = "22222222-2222-4222-8222-222222222222";
const RECIPIENT_ID = "33333333-3333-4333-8333-333333333333";

describe("notification email rendering", () => {
  it("validates an outbox claim and escapes untrusted content", () => {
    const [item] = parseOutboxItems([{
      id: OUTBOX_ID,
      notification_id: NOTIFICATION_ID,
      recipient_id: RECIPIENT_ID,
      recipient_email: "parent@example.com",
      recipient_name: "<Parent>",
      type: "submission_reviewed",
      subject: "Activity reviewed",
      title: "Paper <script>craft</script>",
      message: "Score: 9 & feedback",
      action_url: "/reviews/123",
      metadata: { score: 9 },
      event_key: "submission:reviewed:123",
      attempt_count: 0,
    }]);

    expect(item).toBeDefined();
    const rendered = renderNotificationEmail(item!, "https://elikha.example");
    expect(rendered.html).toContain("&lt;script&gt;craft&lt;/script&gt;");
    expect(rendered.html).toContain("Score: 9 &amp; feedback");
    expect(rendered.html).toContain("https://elikha.example/reviews/123");
    expect(rendered.html).not.toContain("<script>");
  });

  it("does not render a javascript action URL", () => {
    const [item] = parseOutboxItems([{
      id: OUTBOX_ID,
      notification_id: NOTIFICATION_ID,
      recipient_id: RECIPIENT_ID,
      recipient_email: "parent@example.com",
      recipient_name: null,
      type: "test",
      subject: null,
      title: "Notice",
      message: "Message",
      action_url: "javascript:alert(1)",
      metadata: {},
      event_key: "test:1",
      attempt_count: 1,
    }]);

    const rendered = renderNotificationEmail(item!, "https://elikha.example");
    expect(rendered.html).not.toContain("javascript:");
    expect(rendered.text).not.toContain("javascript:");
  });
});

describe("Supabase auth email hook", () => {
  it("builds a safe verification link", () => {
    const url = buildAuthConfirmationUrl(
      "https://project.supabase.co",
      "https://elikha.example",
      "token-hash",
      "recovery",
      "https://elikha.example/reset-password",
    );

    expect(url).not.toBeNull();
    const parsed = new URL(url!);
    expect(parsed.origin).toBe("https://project.supabase.co");
    expect(parsed.pathname).toBe("/auth/v1/verify");
    expect(parsed.searchParams.get("token")).toBe("token-hash");
    expect(parsed.searchParams.get("type")).toBe("recovery");
    expect(parsed.searchParams.get("redirect_to")).toBe("https://elikha.example/reset-password");
  });

  it("supports secure email change's reversed token-hash mapping", () => {
    const payload = parseAuthHookPayload({
      user: { id: OUTBOX_ID, email: "old@example.com", new_email: "new@example.com" },
      email_data: {
        token: "111111",
        token_hash: "new-address-hash",
        redirect_to: "https://elikha.example/settings",
        email_action_type: "email_change",
        site_url: "https://elikha.example",
        token_new: "222222",
        token_hash_new: "current-address-hash",
      },
    });
    const messages = buildAuthEmailMessages(payload, "https://project.supabase.co");

    expect(messages).toHaveLength(2);
    expect(messages[0]?.to).toBe("old@example.com");
    expect(messages[0]?.text).toContain("111111");
    expect(messages[0]?.text).toContain("current-address-hash");
    expect(messages[1]?.to).toBe("new@example.com");
    expect(messages[1]?.text).toContain("222222");
    expect(messages[1]?.text).toContain("new-address-hash");
  });

  it("keeps reauthentication code-only even when a token hash is present", () => {
    const payload = parseAuthHookPayload({
      user: { id: OUTBOX_ID, email: "parent@example.com" },
      email_data: {
        token: "123456",
        token_hash: "do-not-link-this-hash",
        redirect_to: "https://elikha.example/settings",
        email_action_type: "reauthentication",
        site_url: "https://elikha.example",
      },
    });
    const [message] = buildAuthEmailMessages(payload, "https://project.supabase.co");

    expect(message?.text).toContain("123456");
    expect(message?.text).not.toContain("/auth/v1/verify");
    expect(message?.html).not.toContain("Continue securely");
  });

  it("sends email-change security alerts to the old address", () => {
    const payload = parseAuthHookPayload({
      user: { id: OUTBOX_ID, email: "new@example.com" },
      email_data: {
        token: "",
        token_hash: "",
        redirect_to: "",
        email_action_type: "email_changed_notification",
        site_url: "https://elikha.example",
        old_email: "old@example.com",
      },
    });
    const [message] = buildAuthEmailMessages(payload, "https://project.supabase.co");

    expect(message?.to).toBe("old@example.com");
  });

  it("creates stable, separate delivery keys for retried auth messages", async () => {
    const payload = parseAuthHookPayload({
      user: { id: OUTBOX_ID, email: "old@example.com", new_email: "new@example.com" },
      email_data: {
        token: "111111",
        token_hash: "new-address-hash",
        redirect_to: "https://elikha.example/settings",
        email_action_type: "email_change",
        site_url: "https://elikha.example",
        token_new: "222222",
        token_hash_new: "current-address-hash",
      },
    });
    const first = await buildAuthEmailDeliveries(payload, "https://project.supabase.co");
    const retry = await buildAuthEmailDeliveries(payload, "https://project.supabase.co");

    expect(first).toHaveLength(2);
    expect(first[0]?.deliveryKey).toBe(retry[0]?.deliveryKey);
    expect(first[1]?.deliveryKey).toBe(retry[1]?.deliveryKey);
    expect(first[0]?.deliveryKey).not.toBe(first[1]?.deliveryKey);
  });

  it("distinguishes separate tokenless security events while deduping retries", async () => {
    const payload = parseAuthHookPayload({
      user: { id: OUTBOX_ID, email: "parent@example.com" },
      email_data: {
        token: "",
        token_hash: "",
        redirect_to: "",
        email_action_type: "password_changed_notification",
        site_url: "https://elikha.example",
      },
    });
    const [first] = await buildAuthEmailDeliveries(payload, "https://project.supabase.co", "event-one");
    const [retry] = await buildAuthEmailDeliveries(payload, "https://project.supabase.co", "event-one");
    const [later] = await buildAuthEmailDeliveries(payload, "https://project.supabase.co", "event-two");

    expect(first?.deliveryKey).toBe(retry?.deliveryKey);
    expect(first?.deliveryKey).not.toBe(later?.deliveryKey);
  });
});

describe("retry scheduling", () => {
  it("backs off transient failures and leaves unknown failures to the database", () => {
    expect(retryDelaySeconds("E_RATE_LIMIT_EXCEEDED", 0)).toBe(60);
    expect(retryDelaySeconds("E_INTERNAL_SERVER_ERROR", 3)).toBe(240);
    expect(retryDelaySeconds("E_VALIDATION_ERROR", 1)).toBeNull();
  });
});

describe("HTML escaping", () => {
  it("escapes all HTML special characters", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#039;");
  });
});
