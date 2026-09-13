# E-Likha R2 storage Worker

This Worker is the shared private storage service used by the E-Likha React
app. It stores model binaries, profile pictures, and class images in the
`elikha-3d-models` R2 bucket under separate prefixes. Image objects do not count
toward the app's 3D-model capacity meter.

## API contract

- `GET /health` checks service availability.
- `GET /models` lists built-in and uploaded model metadata.
- `GET /models/search?q=&page=` proxies a Poly Pizza catalogue search. The
  provider API key is a Worker secret and never reaches the browser; the route
  is authenticated (teacher/admin/superadmin) so an allowed origin alone cannot
  spend the request quota. Results are filtered to single-file `.glb` downloads
  that this Worker can import.
- `GET|HEAD /models/files/:id` streams a model and supports byte ranges.
- `GET /storage` reports actual bytes currently stored under the R2 `models/`
  prefix, plus configured capacity and remaining space.
- `POST /models` uploads a model.
- `POST /models/import` imports an allowlisted HTTPS model from Poly Pizza
  (`static.poly.pizza`). The importer stores the provider's attribution string,
  which the app displays on the admin model list and in every activity that
  uses the model, satisfying the CC-BY credit requirement.
- `PATCH /models/:id` edits custom-model metadata.
- `PUT /models/:id/file` replaces a custom-model file.
- `DELETE /models/:id` removes a custom model and its metadata.
- `GET|HEAD /media/avatars/:userId` returns an authenticated profile picture.
- `PUT|DELETE /media/avatars/:userId` replaces or removes a profile picture.
- `GET|HEAD /media/classes/:classId` returns an image after checking class access.
- `PUT|DELETE /media/classes/:classId` replaces or removes a class image after
  confirming the caller is an administrator or the class's assigned teacher.

The model read routes are public so students can load assigned AR content. Media
routes are private and require a valid Supabase session. Model mutations
require a valid Supabase access token and a current `teacher`, `admin`, or
`superadmin` role in `public.users`. Before release, apply and verify the latest
Supabase authorization-hardening migrations so learners cannot change their own
role.

Legacy `avatars/...` and `class-images/...` references are supported during the
cutover. When the browser supplies an authorized legacy path and the R2 object
does not exist, the Worker streams the private Supabase object to the caller and
copies it into R2 in the background. Supabase originals are retained as rollback
copies until they are deliberately removed later.

## Storage rules

- Accepted stored formats: `.obj`, `.3ds`, `.glb`, and `.blend`.
- `.blend` is accepted as a source/archive file, but browsers cannot render it
  directly. Convert it to `.glb` before selecting it for an AR activity.
- Maximum file size defaults to 50 MiB (`MAX_MODEL_FILE_BYTES=52428800`).
- Profile-picture and class-image uploads accept PNG, JPG, or WebP sources up to
  20 MiB. The browser crops and compresses them before upload.
- Application capacity defaults to 10 GB
  (`MODEL_STORAGE_CAPACITY_BYTES=10000000000`). This is an E-Likha limit, not the
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
   10 GB application capacity.
3. Store the public Supabase client key as a Worker secret without placing its
   value on the command line:

   ```sh
   npx wrangler secret put SUPABASE_ANON_KEY
   ```

4. Store the Poly Pizza API key as a Worker secret so free-model search works.
   Without it, `GET /models/search` returns `503 MODEL_SEARCH_UNCONFIGURED` and
   the admin "Find Free Models" panel shows that message; import and all other
   routes are unaffected:

   ```sh
   npx wrangler secret put POLY_PIZZA_API_KEY
   ```

5. Run `npm run check`, `npx wrangler deploy --dry-run`, and relevant contract
   tests before any deployment.
6. Set the deployed Worker URL as `REACT_APP_R2_MODEL_API_URL` in the React
   hosting environment and rebuild the web app. The same URL serves models and
   private app images.

Never add a Supabase service-role key to this Worker. Role authorization is
performed with the signed-in user's access token and database Row Level
Security.
