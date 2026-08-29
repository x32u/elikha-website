# E-Likha notifications Worker

This Worker delivers transactional parent and authentication emails. It is intentionally separate from the R2 model Worker.

It has three entry points:

- A Cloudflare Cron Trigger (`*/5 * * * *`, UTC) that generates parent activity reminders, atomically claims the email outbox, delivers messages, and records success or retryable failure.
- `POST /internal/run`, a non-browser manual trigger protected by `Authorization: Bearer <MANUAL_RUN_SECRET>`.
- `POST /auth-email-hook`, a signed Supabase Send Email Hook for signup, invite, magic-link, OTP/reauthentication, recovery, email-change, and account-security emails.

All other HTTP routes return `404`. No CORS headers are emitted and there is no public browser API.

## Required database contract

The Worker uses service-role-only Supabase RPCs:

- `generate_parent_activity_reminders()`
- `claim_notification_email_outbox(p_limit int, p_worker_id text)`
- `complete_notification_email(p_outbox_id uuid, p_worker_id text, p_provider_message_id text)`
- `fail_notification_email(p_outbox_id uuid, p_error text, p_worker_id text, p_retry_after_seconds int)`
- `claim_auth_email_delivery(p_delivery_key text, p_claim_id uuid)`
- `complete_auth_email_delivery(p_delivery_key text, p_claim_id uuid, p_provider_message_id text)`
- `release_auth_email_delivery(p_delivery_key text, p_claim_id uuid)`

The claim RPC must atomically lock rows and return:

`id`, `notification_id`, `recipient_id`, `recipient_email`, `recipient_name`, `type`, `subject`, `title`, `message`, `action_url`, `metadata`, `event_key`, and `attempt_count`.

Database `event_key` uniqueness plus atomic claiming makes repeated Cron invocations safe. Delivery is still at-least-once: no email provider can guarantee exactly-once delivery if an email succeeds but the following database acknowledgement is interrupted.

## Before deployment

Cloudflare Email Sending requires a domain that uses Cloudflare DNS and has completed Email Service onboarding. Do not deploy this Worker until the sender is verified.

1. In Cloudflare, open **Compute > Email Service > Email Sending** and onboard the sending domain.
2. Update `EMAIL_FROM_ADDRESS`, `APP_BASE_URL`, and (if needed) `EMAIL_FROM_NAME` in `wrangler.jsonc`.
3. After the sender address is final, restrict `send_email` with `allowed_sender_addresses`.
4. Install dependencies and generate binding types:

   ```sh
   npm install
   npm run types
   npm run check
   npm test
   npm run dry-run
   ```

5. Configure secrets interactively. Never pass their values on the command line:

   ```sh
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   npx wrangler secret put MANUAL_RUN_SECRET
   npx wrangler secret put SUPABASE_AUTH_EMAIL_HOOK_SECRET
   ```

Use the Supabase project URL for `SUPABASE_URL`, the server-only service-role key for `SUPABASE_SERVICE_ROLE_KEY`, and a long cryptographically random value for `MANUAL_RUN_SECRET`.

## Supabase Send Email Hook

The auth hook is disabled safely when `SUPABASE_AUTH_EMAIL_HOOK_SECRET` is absent. To activate it after this Worker has a stable HTTPS URL:

1. In Supabase Dashboard, open **Authentication > Hooks**.
2. Create a **Send Email** hook of type **HTTPS**.
3. Set its URL to `https://<worker-host>/auth-email-hook`.
4. Generate the hook secret and store the entire `v1,whsec_...` value with `npx wrangler secret put SUPABASE_AUTH_EMAIL_HOOK_SECRET`.
5. Test signup and recovery with real addresses you control before enabling it for users.

The Worker verifies the exact raw request body with Standard Webhooks before parsing it. A valid hook returns an empty `200` response, as required by Supabase. The hook replaces Supabase SMTP for auth emails while enabled.

## Local testing

Copy `.dev.vars.example` to the ignored `.dev.vars` and replace every placeholder. The Email Sending binding must use `remote: true` to send real email in local development; only add that temporarily and only send to addresses you control.

Start scheduled-event testing:

```sh
npm run dev
```

Then trigger the local Cron handler:

```sh
curl "http://localhost:8787/__scheduled?cron=*/5+*+*+*+*"
```

Do not expose Wrangler's local scheduled-test endpoint to the internet.

Trigger the protected manual endpoint:

```sh
curl -X POST "http://localhost:8787/internal/run" \
  -H "Authorization: Bearer <MANUAL_RUN_SECRET>"
```

Structured logs intentionally omit recipient email addresses, auth tokens, hook payloads, and service credentials.
