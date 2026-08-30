# e-Likha Web

The web application for e-Likha, an arts and crafts learning platform with
guided activities, role-based workspaces, progress tracking, and interactive AR
experiences for elementary learners.

## Features

- Student activities with step-by-step and voice-assisted guidance
- Web-based augmented-reality activities and manipulable 3D models
- Class, activity, submission, and review workflows for teachers
- Groq-assisted AR submission checking based on each activity's teacher-created rubric
- Role-specific administration for students, teachers, admins, and super admins
- Progress, database-backed parent notifications, settings, audit, and direct email-OTP password recovery
- Supabase authentication and application data, with Cloudflare R2 model storage

## Technology

- React 18 and React Router
- Supabase
- Three.js with React Three Fiber and Drei
- MediaPipe Hands and Tasks Vision
- Create React App

## Local setup

Requirements: Node.js 18 or newer and npm.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment template:

   ```bash
   cp .env.example .env
   ```

3. Add your Supabase project URL and anonymous client key to `.env`.

4. Start the development server:

   ```bash
   npm start
   ```

The application will be available at `http://localhost:3000`.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `REACT_APP_SUPABASE_URL` | Yes | Supabase project URL |
| `REACT_APP_SUPABASE_ANON_KEY` | Yes | Public anonymous client key; access must still be protected by RLS |
| `REACT_APP_SITE_URL` | No | Base URL used when constructing password-reset redirects |
| `REACT_APP_PASSWORD_RESET_REDIRECT_URL` | No | Explicit password-reset destination |
| `REACT_APP_R2_MODEL_API_URL` | Yes for shared models | Deployed Cloudflare R2 model Worker URL; enables the shared library and real storage metrics |

Never commit `.env` files or Supabase service-role keys. The browser application
must only use the anonymous client key with appropriate Row Level Security
policies.

### Cloudflare R2 model storage

The shared model library and administrator storage dashboard read real object
usage from `cloudflare/r2-models-worker`. The Worker enforces the configured 1
GiB application capacity for model binaries and a 50 MiB limit per model. It
stores `.obj`, `.3ds`, `.glb`, and `.blend`; Blender files are source files and
must be converted to `.glb` before use in browser AR.

Set `REACT_APP_R2_MODEL_API_URL` to the deployed Worker URL before building the
web app. See `cloudflare/r2-models-worker/README.md` for its R2 binding, secret,
CORS, local-development, and release checklist.

## Database setup

The `database/` directory contains SQL migrations and policy helpers for user
profiles, class administration, gesture alerts, settings,
parent/student links, and activity thumbnails. Review each script against the
target Supabase project before applying it.

### Password reset email OTP

Forgotten passwords no longer require administrator approval. The browser calls
Supabase Auth directly to send a recovery email, verifies the code with recovery
OTP type, lets the verified account choose a new password, then revokes its
sessions. Responses do not reveal whether an email address is registered.

The hosted Supabase project must be configured before this works end to end:

1. Open **Authentication → Email Templates → Reset Password**.
2. Set the subject to `Your e-Likha password reset code`.
3. Copy the contents of `supabase/templates/recovery.html` into the template.
   The important placeholder is `{{ .Token }}`. A template containing only
   `{{ .ConfirmationURL }}` sends a link and will not supply the 6-digit code
   expected by this screen.
4. Under **Authentication → Sign In / Providers → Email**, keep email OTP length
   at `6`, choose an appropriate expiry (the local configuration uses one hour),
   and retain Supabase's per-address resend delay. The UI also enforces a
   60-second resend countdown and stops after five failed attempts until a new
   code is requested.
5. The shared E-Likha project has applied
   `supabase/migrations/20260813125601_retire_password_reset_approvals.sql`.
   Apply it to any other Supabase environment only after review. It preserves
   historical request rows while revoking the old browser approval RPC/table
   access and dropping its obsolete notification trigger.

The local Supabase template and OTP settings are recorded in
`supabase/config.toml`. Hosted projects must be configured in the Dashboard;
local template files are not pushed to hosted Auth automatically. Supabase's
built-in mailer is only for testing: it sends only to addresses belonging to
the project's organization team and is heavily rate-limited. Configure custom
SMTP before testing with real student, teacher, or parent addresses. New Free
plan projects may also require custom SMTP before Auth email templates can be
customized.

### Parent notifications and email

The parent notification center stores assignment, grade, due, missing-work,
linked-student, and registration events in Supabase with recipient-scoped Row
Level Security. Historical password-approval notices remain preserved, but the
approval workflow is retired. Apply
`supabase/migrations/20260813063502_parent_notifications.sql` before opening the
notification screen.

Transactional delivery lives in the separate
`cloudflare/notifications-worker` project. Its README contains the sender-domain,
secret, Cron, and Supabase Auth Send Email Hook setup. Do not deploy it until a
Cloudflare DNS domain has completed Email Sending onboarding. Required OTP,
recovery, and security emails are never controlled by optional parent alert
preferences.

### Groq AR checking

Groq runs in the `grade-ar-submission` Supabase Edge Function; its API key is
never placed in the React bundle.

1. Apply `database/rubrics.sql`, then
   `database/ai_submission_grading.sql` in the Supabase SQL editor.
2. Add `GROQ_API_KEY` as a Supabase Edge Function secret. Optionally set
   `GROQ_MODEL`; it defaults to the multimodal `qwen/qwen3.6-27b` model.
   During migration, the function uses `GEMINI_API_KEY` as a fallback only when
   no Groq key is configured.
3. Deploy the function:

   ```bash
   supabase functions deploy grade-ar-submission
   ```

When a student submits an AR activity, the app starts the check automatically.
The result is saved privately and shown in the teacher review modal with
criterion-level evidence. Teachers can accept, edit, or ignore the suggestion;
only **Submit Review** publishes the final rating.

Do not add `GROQ_API_KEY` to `.env`, `.env.local`, or any variable beginning
with `REACT_APP_`, because those values are shipped to the browser.

### DepEd SF9 kindergarten rubrics

Rubrics follow the DepEd SF9 Kindergarten Progress Report. Ratings are the
form's three developmental levels — **BG** Beginning, **DV** Developing, **CO**
Consistent — plus **NO** (not observed) and **NA** (not applicable). The rubric
builder only offers competencies an AR artwork can actually evidence (III.1,
III.2, III.5, III.7, III.10, IV.G.24); competencies that need real materials,
speech, patterns, or the child's own body (I.4, I.5, III.3, III.8, all of
Domain II) are listed as "observe in class instead".

The SF9 alignment shipped across two Supabase migrations that must be applied
before use, in order:

1. `supabase/migrations/20260829094000_sf9_rating_codes_and_terms.sql` — widens
   the `selected_rating` check to accept both `BG/DV/CO` and legacy `B/D/C`,
   relabels existing rows, and adds a nullable `term` (1–3) to
   `rubric_observations`.
2. `supabase/migrations/20260830083500_finalize_review_sf9_codes.sql` —
   `CREATE OR REPLACE` on `finalize_submission_review` so teacher reviews accept
   the SF9 codes. Both migrations are additive; existing `B/D/C` rubrics keep
   working.

**Redeploy the Edge Function after the SF9 change — this is required, not
optional.** The grading prompt and its `CO/DV/BG/NO` response schema live in
`grade-ar-submission`, and the function now derives an ordinal score for
score-less SF9 rubric levels. Until it is redeployed, an AI check against a
rubric built by the current builder **fails** with "no valid scoring levels"
(SF9 levels carry a code but no numeric score). Teacher review still works
without it; only the AI draft is affected.

```bash
supabase functions deploy grade-ar-submission
```

## Commands

```bash
npm start       # run the development server
npm test        # start the test runner
npm run build   # create a production build
```

## Deployment

The included `vercel.json` supports deployment as a client-rendered React
application. Configure the required environment variables in the hosting
provider rather than committing them to the repository.
