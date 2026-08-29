# E-Likha R2 model Worker

This Worker is the shared 3D-model service used by the E-Likha React app. It
stores model binaries and small metadata records in the `elikha-3d-models` R2
bucket.

## API contract

- `GET /health` checks service availability.
- `GET /models` lists built-in and uploaded model metadata.
- `GET|HEAD /models/files/:id` streams a model and supports byte ranges.
- `GET /storage` reports actual bytes currently stored under the R2 `models/`
  prefix, plus configured capacity and remaining space.
- `POST /models` uploads a model.
- `POST /models/import` imports an allowlisted HTTPS model from Poly Haven.
- `PATCH /models/:id` edits custom-model metadata.
- `PUT /models/:id/file` replaces a custom-model file.
- `DELETE /models/:id` removes a custom model and its metadata.

The read routes are public so students can load assigned AR content. Mutations
require a valid Supabase access token and a current `teacher`, `admin`, or
`superadmin` role in `public.users`. Before release, apply and verify the latest
Supabase authorization-hardening migrations so learners cannot change their own
role.

## Storage rules

- Accepted stored formats: `.obj`, `.3ds`, `.glb`, and `.blend`.
- `.blend` is accepted as a source/archive file, but browsers cannot render it
  directly. Convert it to `.glb` before selecting it for an AR activity.
- Maximum file size defaults to 50 MiB (`MAX_MODEL_FILE_BYTES=52428800`).
- Application capacity defaults to 1 GiB
  (`MODEL_STORAGE_CAPACITY_BYTES=1073741824`). This is an E-Likha limit, not the
  Cloudflare account's total R2 quota.
- Capacity counts model objects under `models/`; small records under `metadata/`
  are excluded. When the limit would be exceeded, the Worker returns HTTP `507`
  and the upload is not kept.
- Built-in models are immutable through the HTTP API. Teachers, administrators,
  and super administrators can manage uploaded custom models.

## Local setup

1. Install the locked dependencies:

   ```sh
   npm ci
   ```

2. Copy the local secret template and add the matching Supabase public client
   key:

   ```sh
   cp .dev.vars.example .dev.vars
   ```

3. Review `wrangler.jsonc`. For local React development, its default origins are
   `http://localhost:3000` and `http://127.0.0.1:3000`.

4. Verify before running:

   ```sh
   npm run check
   npx wrangler deploy --dry-run
   npm run dev
   ```

Wrangler uses a local R2 bucket during ordinary local development. The
`seed:builtins` script writes to the remote production bucket and should only be
run deliberately when reseeding that bucket.

## Production checklist

1. Add every exact deployed web origin to `ALLOWED_ORIGINS` in `wrangler.jsonc`.
   Do not use a wildcard because mutation routes accept bearer credentials.
2. Confirm `SUPABASE_URL`, the R2 bucket name, the 50 MiB file limit, and the
   1 GiB application capacity.
3. Store the public Supabase client key as a Worker secret without placing its
   value on the command line:

   ```sh
   npx wrangler secret put SUPABASE_ANON_KEY
   ```

4. Run `npm run check`, `npx wrangler deploy --dry-run`, and relevant contract
   tests before any deployment.
5. Set the deployed Worker URL as `REACT_APP_R2_MODEL_API_URL` in the React
   hosting environment and rebuild the web app.

Never add a Supabase service-role key to this Worker. Role authorization is
performed with the signed-in user's access token and database Row Level
Security.
