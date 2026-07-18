# e-Likha Web

The web application for e-Likha, an arts and crafts learning platform with
guided activities, role-based workspaces, progress tracking, and interactive AR
experiences for elementary learners.

## Features

- Student activities with step-by-step and voice-assisted guidance
- Web-based augmented-reality activities and manipulable 3D models
- Class, activity, submission, and review workflows for teachers
- Role-specific administration for students, teachers, admins, and super admins
- Progress, notification, settings, audit, and password-reset workflows
- Supabase authentication, storage, and application data

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

Never commit `.env` files or Supabase service-role keys. The browser application
must only use the anonymous client key with appropriate Row Level Security
policies.

## Database setup

The `database/` directory contains SQL migrations and policy helpers for user
profiles, class administration, gesture alerts, settings, password resets,
parent/student links, and activity thumbnails. Review each script against the
target Supabase project before applying it.

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
