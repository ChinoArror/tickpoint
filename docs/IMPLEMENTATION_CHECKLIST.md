# TickPoint Implementation Checklist

Checked items are confirmed in the repository source. Unchecked items are either not present in the code or cannot be confirmed from the repository alone; the note explains which.

"Pending verification" means the code exists but the behaviour has not been verified against a live service, a real browser or production. Those items are deliberately left unchecked.

Test counts are from the test files (59 integration cases and 49 unit cases). The suites were not executed while writing this checklist.

## Phase 1: Foundation

- [x] Vue 3 SPA with TypeScript, Vite, Vue Router and Pinia (`src/client/router`, `src/client/stores`)
- [x] Cloudflare Worker with Hono under `/api/v1` (`src/server/index.ts`)
- [x] Workers Static Assets with SPA fallback; `run_worker_first` limited to `/api/*` (`wrangler.jsonc`)
- [x] D1 schema and initial migration (`src/server/db/schema.ts`, `migrations/0000_init.sql`)
- [x] Tailwind v4 design tokens and UI kit (`src/client/styles/main.css`, `src/client/components/ui`)
- [x] English and Japanese UI with key-parity tests (`src/locales`, `tests/unit/i18n.test.ts`)
- [x] AuthCenter client: login redirect, `/api/verify` verification, encrypted server-side JWT, opaque session cookie (`src/server/auth`)
- [x] Redirect-loop protection and same-origin return paths (`src/server/auth/session.ts`)
- [x] Development sign-in gated by `APP_ENV`, `DEV_AUTH_BYPASS` and localhost (`src/server/api/auth.ts`)
- [x] API security headers, CSRF origin check, body size limits (`src/server/middleware/index.ts`)
- [x] HTML security headers and CSP (`public/_headers`)
- [x] PWA manifest and custom service worker with precache, Web Push display and notification click (`vite.config.ts`, `src/client/sw/sw.ts`)
- [ ] Live AuthCenter sign-in on `https://point.aryuki.com`: **pending verification**
- [ ] Installable PWA verified in a real browser and on iOS: **pending verification**

## Phase 2: Core Data

- [x] Projects CRUD and archive (`src/server/api/planning.ts`, `src/client/pages/ProjectsPage.vue`, `ProjectDetailPage.vue`)
- [x] Tasks with kinds, status, priority, hierarchy, dependencies, soft delete and restore (`src/server/services/tasks.ts`, `tests/integration/tasks.test.ts`)
- [x] Deadline precision model: exact, date, approximate, unknown (`src/shared/constants.ts`, `src/shared/time.ts`)
- [x] Goals with progress models (binary, percentage, quantity, time, checkpoint, weighted) (`src/server/services/goals.ts`, `src/shared/constants.ts`)
- [x] Checkpoints with dependencies, reorder and impact preview (`src/server/services/checkpoints.ts`, `src/client/components/checkpoint/CheckpointList.vue`)
- [x] Progress entries and history (`src/client/components/goal/ProgressLogCard.vue`, `ProgressHistoryCard.vue`)
- [x] Tags (`src/server/api/planning.ts`)
- [x] Source documents (`src/client/pages/SourcePage.vue`)
- [x] Search across tasks, goals and projects (`GET /search`, `src/client/components/shell/SearchPalette.vue`)
- [x] Quick add dialog with keyboard submit (`src/client/components/task/QuickAddDialog.vue`)
- [x] Task list with views and filters (`src/client/pages/TaskListPage.vue`)
- [x] Kanban board with drag-and-drop status changes (`src/client/pages/TaskListPage.vue`, Board mode)

## Phase 3: Smart Capture

- [x] Extraction endpoint producing an unconfirmed draft (`src/server/api/ai.ts`, `src/server/ai/service.ts`)
- [x] Structured extraction schema with English keys (`src/server/ai/schemas/extraction.ts`, `tests/unit/ai.test.ts`)
- [x] Evidence verification against the source, tolerant of whitespace and width (`src/server/ai/postprocess.ts`, `tests/unit/ai.test.ts`)
- [x] Source fenced with a random boundary and treated as untrusted (`src/server/ai/prompts/shared-instructions.ts`)
- [x] Mandatory review form before anything is saved (`src/client/components/capture/ReviewForm.vue`, `reviewModel.ts`, `src/client/pages/SmartCapturePage.vue`)
- [x] Confirmation commits only the user-approved record (`tests/integration/ai.test.ts`)
- [x] Rejecting a draft creates nothing and discards the source copy (`tests/integration/ai.test.ts`)
- [x] Temporary source copy removed after 7 days (`src/server/reminders/dispatcher.ts`, housekeeping)
- [x] Invalid AI output handled with bounded retries (`src/server/ai/providers/gemini.ts`, `tests/integration/ai.test.ts`)
- [x] Real Gemini extraction verified on 2026-10-13 against `gemini-3.8-flash` (bilingual announcement: 4 deadlines separated, no invented times, missing time zone flagged, all evidence verified, prompt injection ignored; ~29 s, ~6.5k tokens)

## Phase 4: AI Checkpoints

- [x] Plan generation returns a draft with feasibility (`src/server/ai/service.ts` `generatePlan`)
- [x] Deterministic plan checks: past dates, deadline overruns, insufficient time, dependency cycles (`src/server/ai/postprocess.ts`, `tests/unit/ai.test.ts`)
- [x] Selective regeneration of chosen checkpoints only (`regeneratePlan`, `tests/integration/ai.test.ts`)
- [x] Manual edits protected; `EDITED_CHECKPOINTS` returned unless confirmed (`tests/integration/ai.test.ts`)
- [x] Official checkpoints created only after approval, including dependencies (`confirmPlan`, `tests/integration/ai.test.ts`)
- [x] Plan editor page (`src/client/pages/PlanEditorPage.vue`)
- [x] AI usage recorded and agent quota enforced (`ai_usage` table, `src/server/auth/authcenter.ts`)
- [x] Real checkpoint planning verified on 2026-10-13 (6 measurable checkpoints with dependencies; feasibility 30.5 h needed vs 66 h available)

## Phase 5: Time Management

- [x] Date-only and approximate deadlines never invent a time (`src/shared/time.ts`, `tests/unit/time.test.ts`)
- [x] Daylight saving handling for conversions and day boundaries (`tests/unit/time.test.ts`)
- [x] Live countdowns with overdue formatting (`src/client/components/domain/CountdownChip.vue`, `tests/unit/time.test.ts`)
- [x] Calendar with month, week and day views (`src/client/pages/CalendarPage.vue`, FullCalendar)
- [x] Timeline and Gantt view (`src/client/pages/TimelinePage.vue`, `src/client/components/views/GanttChart.vue`). Dependency arrows are not drawn; a lock icon marks blocked tasks.
- [x] Reminder rules and materialised jobs with a unique dedupe key (`src/server/reminders/schedule.ts`)
- [x] Idempotent, claim-based cron dispatcher (`src/server/reminders/dispatcher.ts`, `tests/integration/reminders.test.ts`)
- [x] Quiet hours defer delivery (`tests/integration/reminders.test.ts`)
- [x] Retry with backoff and a give-up limit for transient push failures (`tests/integration/reminders.test.ts`)
- [x] Snooze creates a new occurrence (`tests/integration/reminders.test.ts`)
- [x] Reminders cancelled for completed targets and rescheduled on deadline change (`tests/integration/tasks.test.ts`)
- [x] Notification history, read state and delivery log (`src/client/pages/NotificationsPage.vue`, `src/server/api/notify.ts`)
- [x] Honest per-channel results, with email reported as skipped while no provider is configured (`src/server/notifications/channels.ts`)
- [ ] Web Push delivery to a real browser: **pending verification**
- [ ] Email delivery through a provider: **pending verification**. `EMAIL_PROVIDER` is `none`.

## Phase 6: Analytics

- [x] Analytics endpoint with 7, 30, 90 and 365 day ranges (`src/server/api/overview.ts`, `src/server/services/analytics.ts`)
- [x] Analytics page with ECharts (`src/client/pages/AnalyticsPage.vue`, `src/client/components/charts/EChart.vue`)
- [x] Deterministic deadline risk and goal health (`src/shared/insights.ts`, `tests/unit/insights.test.ts`)
- [x] Overview dashboard (`src/client/pages/OverviewPage.vue`)
- [x] Activity log (`src/client/pages/ActivityPage.vue`, `GET /activity`)
- [x] JSON export and formula-safe CSV export (`src/server/services/transfer.ts`, `src/server/api/data.ts`)
- [x] Import with preview, commit and duplicate skipping; ownership never taken from the file (`src/server/services/transfer.ts`, `tests/integration/isolation.test.ts`)
- [x] Backups stored in R2 with list, download, restore and delete (`src/server/api/data.ts`)
- [x] Account data deletion requiring confirmation (`DELETE /api/v1/account/data`)

## Phase 7: Production Readiness

- [x] Unit test suite present (49 cases in `tests/unit/`). Not executed while writing this checklist.
- [x] Test suites pass: 106 tests (53 unit, 53 integration inside workerd with migrated D1 and stubbed AuthCenter/Gemini) via `npm test`
- [x] Cross-user isolation tests (`tests/integration/isolation.test.ts`)
- [x] Secrets excluded from git (`.gitignore`) and from the front end
- [x] Secret sync script that never prints values (`scripts/sync-secrets.mjs`)
- [x] Error responses sanitised; unexpected errors return a generic message with a request id (`src/server/index.ts`)
- [x] Daily housekeeping cron (`src/server/index.ts`, `src/server/reminders/dispatcher.ts`)
- [x] Custom domain route and `workers_dev` disabled in `wrangler.jsonc`
- [x] Developer documentation: README, `docs/CONFIGURATION.md`, `docs/API.md`, `docs/UI_GUIDE.md`
- [x] Production build verified (`vite build` + `wrangler deploy`, 2026-10-13)
- [ ] Playwright end-to-end tests: **not configured** (no Playwright config file; not run in CI)
- [x] R2 bucket `tickpoint-save` present and remote D1 migration `0000_init` applied (2026-10-13)
- [x] Production deployment completed (2026-10-13); secrets AUTH_APP_SECRET, GEMINI_API_KEY, VAPID_PRIVATE_KEY uploaded
- [x] Custom domain `point.aryuki.com` serves the SPA, API, security headers and the AuthCenter login redirect (smoke-tested 2026-10-13)
- [ ] Live AuthCenter sign-in, verification and silent renewal in production: **pending verification**
- [ ] Web Push delivery verified end to end: **pending verification**
- [ ] Email delivery verified end to end: **pending verification**. Cloudflare Email Service binding `EMAIL` is deployed, `point.aryuki.com` is enabled for sending, and templates/recipient verification are covered by integration tests; no real message has been sent yet (live send skipped by request).

## Update 2026-10-13 (round 2)

- [x] AuthCenter agent usage limits: strict pre-check (fail closed), consume after every call including invalid-output attempts, `GET /api/v1/ai/quota` + Settings → AI "Usage limits" card (verified live: test session reports unlimited)
- [x] Email recipients: account email (when AuthCenter-verified) by default, up to 5 extra addresses with 6-digit code verification, deep link from the email, per-address enable/disable
- [x] Branded English/Japanese email templates (reminder, verification, test), previewed in a browser
- [x] Display fixes: Card body padding (affected every card), container-responsive due editor, settings row layout (Default reminders, quiet hours), Smart Capture review layout, evidence/location mapping
- [x] Mobile optimisation verified on production at 375 px: compact top bar, task view pills and filter sheet, swipeable board, calendar week strip, sticky Smart Capture footer, context-aware quick-add button, compact More sheet with language/theme
