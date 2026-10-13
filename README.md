# TickPoint

**TickPoint - Make Every Moment Count.**

## 1 Product overview

TickPoint is a personal planner for deadlines, tasks, goals and the checkpoints that lead to them. It turns messy source material (an assignment announcement, a competition rule, an invitation email) into a reviewable plan, and then keeps that plan honest with precise deadlines, live countdowns and deterministic risk signals.

TickPoint answers five questions:

1. **What is due, and exactly when?**
2. **What do I need to do before it is due?**
3. **Am I on track, and what is at risk?**
4. **When should TickPoint remind me?**
5. **How have I been progressing over time?**

### Key features

- **Smart Capture**: paste source text, let the AI extract deadlines, deliverables, requirements, rewards and locations, each with a supporting quotation. Every extracted item is verified against the source and nothing is saved until you review and approve it (mandatory review).
- **AI checkpoint planning**: generate a draft plan of checkpoints for a task or goal, check its feasibility, and regenerate only the checkpoints you select. Manual edits are protected.
- **Precise deadlines**: each deadline has a precision level: `exact` (date, time and time zone confirmed), `date` (date only, no time is ever invented), `approximate` (for example "late October") or `unknown` (a deadline exists but its date is not known yet). Countdowns update live.
- **Deterministic risk and goal health**: schedule risk (on track, attention, at risk, overdue) and goal progress are computed by plain code from dates, estimates and dependencies. The AI never decides risk.
- **Reminders**: in-app notifications, Web Push, and email through a provider abstraction (email is off until a provider is configured).
- **Planning views**: list and Kanban board (drag-and-drop status changes), calendar (month, week and day grids with drag-to-reschedule), timeline, and a Gantt view with dependency locks.
- **Analytics**: charts for completion and progress over a selectable range.
- **Interface**: English and Japanese, with a manual choice that overrides browser detection.
- **Installable PWA**: offline app shell, install prompt and Web Push display through a service worker.

## 2 Technology stack

**Frontend**

- Vue 3 with TypeScript, built by Vite 8
- Vue Router and Pinia
- Tailwind CSS v4 with Reka UI (shadcn-style component primitives) and Lucide icons
- VueUse, TanStack Vue Query, and Zod for validation
- ECharts (analytics), FullCalendar (calendar), vue-draggable-plus (checkpoint reordering)
- Vue I18n (English and Japanese)
- vite-plugin-pwa (injectManifest strategy, custom service worker)

**Backend (Cloudflare Workers)**

- Hono for the `/api/v1` API
- Cloudflare D1 (SQLite) with Drizzle ORM
- Cloudflare Cron Triggers (reminder dispatch and daily housekeeping)
- Workers Static Assets (serves the SPA, with SPA fallback)
- Cloudflare R2 (JSON backups and file attachments)
- Web Crypto (session token encryption, token hashing, VAPID signing)
- Google Gemini (REST `generateContent` with structured output)

**Identity**

- AuthCenter (`accounts.aryuki.com`), a central sign-in service. TickPoint never verifies JWT signatures locally.

## 3 Architecture

TickPoint is one Cloudflare Worker. It serves the Vue single-page app as static assets and handles the API itself. Only `/api/*` requests run the Worker code first; every other navigation (including `/sso-callback`) is answered by the static asset layer, so callback tokens never reach Worker request logs.

```text
 Browser (PWA, Vue SPA)
        |
        |  https://point.aryuki.com
        v
 +------------------------------------------------------------+
 | Cloudflare Worker "tickpoint"                              |
 |                                                            |
 |  Workers Static Assets  -- SPA fallback for non-/api/*     |
 |                                                            |
 |  run_worker_first: /api/*                                  |
 |    Hono app, /api/v1                                       |
 |      security headers, CSRF origin check, body limits      |
 |      AuthCenter session + test-identity scope enforcement  |
 |      services (tasks, checkpoints, goals, AI, reminders)   |
 |                                                            |
 |  Cron Triggers                                             |
 |    * * * * *    reminder dispatcher                        |
 |    17 3 * * *   housekeeping                               |
 +----+-----------------+------------------+------------------+
      |                 |                  |
      v                 v                  v
   D1 database     R2 bucket         Google Gemini
   tickpoint-db    tickpoint-save    (generateContent)

 AuthCenter (accounts.aryuki.com): sign-in pages, /api/verify,
 quota and analytics endpoints. Called from the Worker only.
```

### Repository structure

```text
tickpoint/
  src/
    client/          Vue 3 SPA: pages, components, composables, stores, router, i18n, PWA service worker
      sw/            Service worker source (precache, Web Push, notification click)
    server/          Cloudflare Worker (Hono)
      api/           Route modules (auth, planning, ai, notify, overview, data)
      auth/          AuthCenter client and session handling
      ai/            Gemini provider, prompts, JSON schemas, post-processing
      db/            Drizzle schema and D1 client
      reminders/     Reminder scheduling and cron dispatcher
      notifications/ Push and email channels, message templates
      services/      Domain services (tasks, checkpoints, goals, settings, transfer, analytics)
      middleware/    Security headers, CSRF, auth, rate limits
      lib/           HTTP envelope and errors, Web Crypto helpers
      env.ts         Worker bindings and environment types
      index.ts       Worker entry (fetch and scheduled handlers)
    shared/          Code shared by client and Worker (schemas, time zones, insights, constants)
    locales/         en.json, ja.json and per-area message parts
  migrations/        Drizzle-generated SQL migrations applied to D1
  tests/
    unit/            Node tests (time, insights, AI prompts and checks, i18n)
    integration/     Tests that run inside workerd against a migrated D1
  scripts/           sync-secrets.mjs (local .dev.vars and remote Worker secrets)
  docs/              API.md, UI_GUIDE.md, CONFIGURATION.md, IMPLEMENTATION_CHECKLIST.md
  public/            Static files: _headers (HTML security headers and CSP), icons, theme-init.js
  .design/           Local-only secret inputs (git-ignored)
  wrangler.jsonc     Worker configuration: routes, bindings, cron triggers, non-secret vars
  vite.config.ts     Vite, Vue, Tailwind, Cloudflare plugin and PWA configuration
  vitest.config.ts   Unit and integration test projects
  drizzle.config.ts  Drizzle Kit configuration (schema path and migrations output)
```

## 4 Local development

### Prerequisites

- Node.js 24 or newer
- npm
- Access to the `.design/secret.json` file (not in the repository; see [docs/CONFIGURATION.md](docs/CONFIGURATION.md))

### Steps

```bash
npm install --legacy-peer-deps

# Generate .dev.vars from .design/secret.json (also creates VAPID keys once)
node scripts/sync-secrets.mjs --local

# Apply migrations to the local D1 database
npm run db:migrate:local

# Start the app
npm run dev
```

Open http://localhost:5173.

### Signing in locally

AuthCenter cannot redirect to `localhost`, so local development uses a development-only sign-in. It is enabled only when all of these hold:

- `APP_ENV` is `development`
- `DEV_AUTH_BYPASS` is `true`
- the request host is `localhost`

The sign-in page then shows **Alice** and **Bob** buttons. They call `POST /api/v1/auth/dev-login` and create two fixed development identities. These identities do not exist in AuthCenter, and the AI agent quota (which lives in AuthCenter) does not apply to them.

## 5 Environment configuration

TickPoint reads non-secret values from `vars` in `wrangler.jsonc` and secrets from the Worker secret store (in production) or `.dev.vars` (locally). Secrets are never committed.

The full variable reference, the mapping from `.design/secret.json` to application settings, and the local versus production differences are in **[docs/CONFIGURATION.md](docs/CONFIGURATION.md)**. A template with placeholder values is in `.dev.vars.example`.

Note: `scripts/sync-secrets.mjs` also rewrites a few values in `wrangler.jsonc` on every run (`VAPID_PUBLIC_KEY`, `AUTH_APP_ID`, `AUTH_CALLBACK_URL`, `GEMINI_MODEL`). Review the diff after running it.

## 6 D1 setup

The D1 database `tickpoint-db` already exists and is bound as `DB` in `wrangler.jsonc`. Migrations live in `migrations/` and are applied with Wrangler.

```bash
# Local database
npm run db:migrate:local

# Remote (production) database
npm run db:migrate:remote
```

Migrations are generated from `src/server/db/schema.ts` (see section 10).

## 7 AuthCenter setup

TickPoint is registered in AuthCenter as app id `tickpoint`. The registered callback URL is:

```text
https://point.aryuki.com/sso-callback
```

The registered value wins: it must match `AUTH_CALLBACK_URL` exactly, including the path. The route is `/sso-callback` (not `/auth/callback`).

### Sign-in flow

1. The SPA sends the browser to `GET /api/v1/auth/login?return=<path>`. The Worker remembers the intended destination and redirects to `accounts.aryuki.com/login?app_id=tickpoint&redirect=<callback>`.
2. After sign-in, AuthCenter redirects to `/sso-callback?token=<JWT>`.
3. The SPA page reads the token, immediately removes it from the address bar with `history.replaceState`, and POSTs it to `POST /api/v1/auth/session`.
4. The Worker verifies the token by calling AuthCenter `GET /api/verify?app_id=tickpoint` with the JWT as a Bearer token. TickPoint never verifies the JWT signature locally, and the app secret is **not** the JWT signing key. The response must confirm the account, the app permission and that the central session has not been revoked. The `sub`/`uuid` must match the token.
5. The Worker upserts the user (keyed by the AuthCenter uuid), ensures a personal workspace and settings exist, and stores the JWT encrypted with AES-GCM server-side. The browser receives only an opaque, HttpOnly, SameSite=Lax session cookie (`tp_session`, 30-day maximum age). Only a SHA-256 hash of the cookie value is stored.
6. While the session is in use, the Worker re-verifies the JWT with AuthCenter every 5 minutes, so central revocation takes effect quickly. If AuthCenter is briefly unreachable, a session verified in the last 30 minutes keeps working.
7. The local session ends when the JWT expires (at most one hour). The API then returns `SESSION_EXPIRED`, and the client sends the browser through `/api/v1/auth/login` for silent renewal. Redirect loops are blocked: more than 3 attempts within 2 minutes redirect to `/signin?error=loop`.

### Sign-out

- `POST /api/v1/auth/logout` ends only the TickPoint session.
- Central sign-out goes through `accounts.aryuki.com/logout?redirect=<url>`.

### Test identities

AuthCenter can issue test identities. TickPoint enforces:

- `allowed_subapps` must include `tickpoint` (or `*`), otherwise the sign-in is refused.
- Data scopes: reads need `private_read` and writes need `private_write`.
- Each request by a test identity is reported to AuthCenter `POST /api/test-auth/usage`.

### Other AuthCenter calls (server-side only)

- `GET /api/quota/check` and `POST /api/quota/consume` (app secret) enforce the AI agent quota. The check fails open when AuthCenter is unreachable; the local AI rate limit still applies.
- `POST /api/track` (best effort) records login analytics.

## 8 Gemini setup

AI features use Google Gemini through the REST `generateContent` API.

- Set `GEMINI_API_KEY` as a secret. Set `GEMINI_MODEL` as a variable (the current value is `gemini-3.8-flash`).
- If `GEMINI_API_KEY` is missing, AI endpoints return `NOT_CONFIGURED` (503) and the rest of the app works normally. `GET /api/v1/auth/config` reports `aiConfigured`.

Behaviour:

- **Structured output**: requests send a JSON schema through `responseJsonSchema`. Responses are validated with Zod. If the model rejects the schema, the provider falls back to plain JSON mode with local validation.
- **Limits**: 75-second timeout per call, at most 2 attempts with backoff, and a size cap on the response.
- **Local rate limits**: 30 AI requests per hour and 150 per day per user, on top of the AuthCenter agent quota.
- **Usage tracking**: token counts are written to the `ai_usage` table and reported to the AuthCenter quota.
- **Prompts**: all prompts are in English under `src/server/ai/prompts/`. The output language follows the user's interface language; quoted evidence is never translated.
- **Prompt-injection defence**: user source text is fenced with a random boundary and treated as untrusted data. The model is told to ignore instructions inside the source.
- **Evidence verification**: each extracted item carries a quotation. The server checks it against the source text (exact match, tolerant of whitespace and character width). Fabricated quotes are flagged as unverified.
- **Drafts only**: AI output is stored as a draft. Nothing becomes an official record until the user reviews and confirms it, and confirmation re-validates the payload through the normal domain services. Pending extraction drafts keep their temporary source copy for at most 7 days.

## 9 Notification setup

| Channel | Requirement |
| --- | --- |
| In-app | Always available. Every reminder is recorded in the notification history. |
| Web Push | VAPID key pair. The public key goes in `VAPID_PUBLIC_KEY` (a variable); the private key goes in `VAPID_PRIVATE_KEY` (a secret). `scripts/sync-secrets.mjs` generates the pair once into `.design/vapid.json`. `VAPID_SUBJECT` must be a `mailto:` address. On iOS, push works only after the PWA is installed to the Home Screen. |
| Email | `EMAIL_PROVIDER` is `none`, `resend` or `cloudflare`. With `resend`, set `RESEND_API_KEY` as a secret. With `cloudflare`, bind a Cloudflare Email Sending binding named `EMAIL` in `wrangler.jsonc` (the binding is not present yet). |

The current setting is `EMAIL_PROVIDER: "none"`. Email reminders are then recorded honestly as **skipped** (`email_provider_not_configured`) in the delivery log and are not sent. `GET /api/v1/auth/config` reports `emailConfigured: false` in this state.

Reminder timing: a reminder is a rule relative to its target (for example 1 hour before). Jobs are created for the exact fire instant. Delivery happens on the one-minute cron, so reminders are "within about a minute", not second-exact. Date-only deadlines are anchored at 09:00 in the user's time zone. Quiet hours defer delivery to the end of the quiet window.

## 10 Database migrations

The schema is defined in `src/server/db/schema.ts`. Drizzle Kit generates SQL into `migrations/`.

```bash
# After changing src/server/db/schema.ts
npm run db:generate

# Apply to local D1
npm run db:migrate:local

# Apply to remote D1 (production)
npm run db:migrate:remote
```

Review each generated SQL file before applying it. Wrangler records applied migrations in D1, so do not edit a migration that has already been applied remotely; add a new one instead.

## 11 Testing

```bash
npm test                 # all projects
npm run test:unit        # Node unit tests
npm run test:integration # workerd integration tests
```

### Unit tests (`tests/unit/`, Node environment)

| File | Covers |
| --- | --- |
| `time.test.ts` | Time zone conversion, daylight saving transitions, day boundaries, date-only deadlines, countdown formatting |
| `insights.test.ts` | Deterministic deadline risk and goal health |
| `ai.test.ts` | Prompt language policy, source fencing, JSON schema keys, evidence verification, plan checks (past dates, deadline overruns, insufficient time, dependency cycles) |
| `i18n.test.ts` | Browser language detection, manual override, translation key parity, placeholders, reminder localisation, safe redirects |

### Integration tests (`tests/integration/`, inside workerd)

The integration project runs the real Worker with `@cloudflare/vitest-plugin`. D1 is migrated from `migrations/` before each file, and tables are emptied between tests. AuthCenter and Gemini are replaced by a programmable fetch stub, so no test calls a real external service.

| File | Covers |
| --- | --- |
| `auth.test.ts` | Session creation through AuthCenter verification, rejection of malformed, expired, unauthorised and mismatched tokens, test-identity scopes, revoked sessions, local logout, login redirects and open-redirect protection, CSRF, dev sign-in disabled outside development |
| `tasks.test.ts` | Deadline precision, hierarchy and dependency cycles, checkpoint progress, soft delete and undo, reminder rescheduling and cancellation |
| `reminders.test.ts` | Idempotent delivery, overlapping dispatchers, localisation, quiet hours, cancellation for completed targets, push retry and give-up, snooze, honest notification test results |
| `ai.test.ts` | Extraction drafts and confirmation, planning drafts, regeneration that protects manual edits, invalid AI output, input limits, AI disabled setting, quota stop |
| `isolation.test.ts` | Users cannot read, change or reference another user's records; imports never change ownership |

### End-to-end tests

Browser-level end-to-end tests (Playwright) are not set up yet; UI flows were checked manually in a browser against the local Worker and D1.

## 12 Building

```bash
npm run build
```

This runs the Vue type check (`vue-tsc`) and then `vite build`, which produces the SPA and the Worker bundle through the Cloudflare plugin. `npm run typecheck` also checks the Worker sources. `npm run build:fast` skips the type check.

## 13 Workers deployment

Deployment changes production, so run these steps deliberately.

```bash
# 1. Confirm the Cloudflare account Wrangler is logged in to
npx wrangler whoami

# 2. Create the R2 bucket once (used for backups and attachments)
npx wrangler r2 bucket create tickpoint-save

# 3. Apply migrations to the remote D1 database
npm run db:migrate:remote

# 4. Upload production secrets from .design/secret.json (and the VAPID private key)
node scripts/sync-secrets.mjs --remote

# 5. Build and deploy the Worker and its static assets
npm run deploy
```

`npm run deploy` runs `npm run build` and then `wrangler deploy`.

## 14 Custom domain setup

`wrangler.jsonc` routes the Worker to the custom domain:

```jsonc
"routes": [{ "pattern": "point.aryuki.com", "custom_domain": true }],
"workers_dev": false,
"preview_urls": false
```

- The `aryuki.com` zone must be in the same Cloudflare account as the Worker.
- The `workers.dev` address and preview URLs are disabled, so the app is reachable only through `point.aryuki.com`.
- `APP_ORIGIN` and `AUTH_CALLBACK_URL` must use this same origin.

## 15 Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `/sso-callback` returns 404 | `/sso-callback` must be served by the SPA fallback. Make sure `run_worker_first` in `wrangler.jsonc` is only `["/api/*"]` and does not include `/sso-callback`. |
| Sign-in fails with an invalid signature | TickPoint must not verify the JWT locally. Verification happens only through AuthCenter `/api/verify`. Do not use the app secret as a JWT key. |
| Redirect loop, or `/signin?error=loop` | More than 3 sign-in attempts within 2 minutes. Check that AuthCenter accepts the session and that the callback matches exactly. Clear the `tp_login` cookie and try again. |
| `SESSION_EXPIRED` appears repeatedly | The JWT lifetime (at most one hour) ended or AuthCenter revoked the central session. The client starts silent renewal through `/api/v1/auth/login`. If renewal keeps failing, the loop guard sends you to `/signin?error=loop`; sign in there manually. |
| AI returns `NOT_CONFIGURED` | `GEMINI_API_KEY` is not set locally (`.dev.vars`) or remotely (`node scripts/sync-secrets.mjs --remote`). |
| AI returns `AI_TIMEOUT` or `AI_UNAVAILABLE` | Upstream Gemini is slow or busy. The Worker retries once; try again later. |
| Push notification not received on iOS | Install the app to the Home Screen first, then enable notifications from inside the installed app. |
| Email reminders show as skipped | `EMAIL_PROVIDER` is `none`. Configure a provider (see section 9). |
| Reminders do not fire locally | The cron does not run automatically under `vite dev`. Trigger it manually with `curl "http://localhost:5173/cdn-cgi/handler/scheduled"`, or run `npx wrangler dev --test-scheduled`. |
| Dark mode styles do not apply | The project uses a `.dark` class on the root element (`@custom-variant dark` in `src/client/styles/main.css`), not the default `prefers-color-scheme` rule. Use the design tokens instead of `dark:` colour variants. |
| `db:migrate:local` says no migrations or fails | Run `npm run db:generate` after schema changes, and check that `migrations/meta/_journal.json` lists the new file. |

## 16 Security considerations

- **No secrets in the repository or the front end.** Secrets come from `.design/secret.json` (git-ignored) and the Worker secret store. `.dev.vars`, `.design/secret.json` and `.design/vapid.json` are listed in `.gitignore`. The sync script never prints secret values.
- **Browser never holds the JWT.** The AuthCenter JWT is stored encrypted server-side. The browser holds only an opaque, HttpOnly, SameSite=Lax cookie. The callback page removes the token from the URL before any other action.
- **HTML security headers** are set in `public/_headers`: a strict Content Security Policy (`default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`), HSTS, `X-Frame-Options: DENY`, `nosniff`, a referrer policy and a Permissions-Policy that disables camera, microphone, geolocation and payment.
- **API security headers** are set on every `/api/*` response, including a `default-src 'none'` CSP and `Cache-Control: private, no-store` by default.
- **CSRF**: every state-changing request must come from the same origin (`Origin` header, or `Sec-Fetch-Site: same-origin` when `Origin` is absent).
- **Ownership** is taken from the verified session and enforced in every service query. The client never supplies the owner.
- **Test identities** are limited by AuthCenter data scopes and reported for usage.
- **Rate limits** apply to sign-in, AI, export, import, backups, notification tests and account deletion. They are D1-backed fixed windows.
- **Body size limits**: 1 MB by default, 256 KB for AI extraction, 5 MB for import and 10 MB (plus overhead) for attachments.
- **Error sanitisation**: unexpected errors return a generic message with a request id. Server logs contain only a truncated, redacted line.
- **Formula-injection-safe CSV**: export cells that begin with `=`, `+`, `-`, `@` or a tab or carriage return are prefixed with an apostrophe.
- **Import remaps identifiers** and never accepts an owner from the file.
- **Prompt-injection controls** for AI (see section 8). AI output is always a draft.

## 17 Known limitations

- **Email is not configured.** `EMAIL_PROVIDER` is `none`, so no email is sent. Delivery through Resend or Cloudflare Email Sending is implemented but not enabled.
- **Web Push delivery is not verified end to end** in a real browser on any platform. The code path exists; treat it as unverified until tested.
- **AuthCenter production sign-in is not verified** from this repository's documentation alone. The app registration and callback URL must match exactly.
- **Reminders run on a one-minute cron.** They are not second-exact.
- **Date-only deadline reminders** are anchored at 09:00 in the user's time zone.
- **Gantt view** does not draw dependency arrows; dependent items show a lock icon instead.
- **Kanban board** (List / Board toggle on task views) supports drag-and-drop status changes; "Load more" pages in list mode refresh only after a reload.
- **No interactive transactions in D1.** Multi-step confirmations use batches and sequential service calls. A failure partway through can leave partial results, so confirmations are written to be safe to retry.
- **End-to-end tests** are not configured (no Playwright config, not run in CI).
- **AI quota** from AuthCenter fails open when AuthCenter is unreachable. The local AI rate limit still applies.
- **AuthCenter app registration** must match `AUTH_APP_ID` and `AUTH_CALLBACK_URL` exactly, or sign-in will fail.
