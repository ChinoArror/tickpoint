# TickPoint Android — architecture and contracts

This is the design reference for the Android app. It is the contract the web client,
the Worker backend and the native shell all build against.

## Principles

- The Vue app in `src/client` stays the single source of UI and business logic. The
  Android APK bundles the **compiled** Vue assets (`android-app/www`), never a remote
  `server.url`.
- The Cloudflare Worker (`src/server`) stays the only backend. AuthCenter stays the only
  identity provider. Browser users see no behaviour change.
- Everything Android-specific lives in `android-app/`. The web code knows only a small
  platform interface (`src/client/platform`), with a browser implementation and a stub
  for the native one. The Android build swaps the stub for `android-app/src/native` through
  one Vite alias (`@native-platform`), so Capacitor code never ships in the web bundle.

## Identity

| Item | Value |
|---|---|
| Application ID | `com.aryuki.tickpoint` |
| App name | TickPoint |
| App web origin (Capacitor) | `https://localhost` (`server.androidScheme = https`, default hostname) |
| API base in the app | `https://point.aryuki.com/api/v1` |
| App Link host | `point.aryuki.com`, path prefix `/app/` |
| Custom scheme (fallback only) | none — the fallback is an `intent://` URL addressed to the package |

## Sign-in (AuthCenter → Worker → app)

AuthCenter documents one flow for subapps: `GET https://accounts.aryuki.com/login?app_id&redirect`,
where `redirect` must match the app's registered `callback_url` (origin, path, HTTPS), and
the JWT (max 1 h) comes back as `?token=`. It has no native, PKCE or code flow. The app therefore
uses the **already registered** callback `https://point.aryuki.com/sso-callback` and a Worker-side
PKCE hand-off. No AuthCenter change is needed.

1. App creates `state` (32 random bytes, base64url) and PKCE `verifier` (32 random bytes,
   base64url), `challenge = base64url(SHA-256(verifier))`, keeps both in memory + secure storage,
   and opens a Custom Tab at
   `GET /api/v1/auth/native/start?state=<state>&challenge=<challenge>&return=<path>`.
2. Worker validates the inputs, stores a pending row in `native_logins` (hashed id, state,
   challenge, return path, expiry 10 min), sets an HttpOnly `tp_native` cookie in the Custom
   Tab's browser, and 302s to the AuthCenter login URL (unchanged callback).
3. AuthCenter signs in (silently if its own session is alive) and redirects the Custom Tab to
   `/sso-callback?token=…`. The SPA POSTs the token to `POST /api/v1/auth/session` as usual.
4. When a valid `tp_native` cookie accompanies that POST, the Worker verifies the JWT with
   `/api/verify` exactly as for the web, but **does not** create a browser session. It stores
   the encrypted JWT on the pending row, mints a one-time `code` (32 random bytes, hashed at
   rest, 5 min), clears the cookie, and answers
   `{ redirect: "https://point.aryuki.com/app/auth-complete?code=…&state=…", native: true }`.
5. The SPA navigates there with a full navigation. If the App Link is verified, Android opens
   the app. Otherwise the public page `/app/auth-complete` shows a **Return to TickPoint**
   button whose `intent://` URL targets the package explicitly.
6. The app checks `state`, then calls `POST /api/v1/auth/native/exchange { code, verifier,
   timeZone, locale }` (CORS, no cookies). The Worker checks the code is unused and unexpired
   and that `SHA-256(verifier)` matches the challenge, marks it used atomically, and creates a
   session (same `sessions` table, `kind = 'native'`). It returns
   `{ token, expiresAt, returnPath }`.
7. The app keeps `token` in Android Keystore-backed storage (`SecureStore` plugin) and sends
   `Authorization: Bearer <token>` on every API call.

Expiry: sessions end with the AuthCenter JWT (≤ 1 h), exactly like the web. On `SESSION_EXPIRED`
the app reruns steps 1–7; with a live AuthCenter session the Custom Tab returns without a prompt.
Logout: `POST /api/v1/auth/logout` (bearer) → device rows for that session are removed → secure
storage cleared → Custom Tab to `https://accounts.aryuki.com/logout?redirect=https://point.aryuki.com/app/signed-out`.

### Server security rules

- CORS is granted only to origins in `NATIVE_APP_ORIGINS` (default `https://localhost`):
  exact `Access-Control-Allow-Origin`, `Vary: Origin`, allowed headers
  `Authorization, Content-Type, Accept`, **no** `Access-Control-Allow-Credentials`.
- The CSRF guard accepts a cross-origin mutation only when the origin is in that list **and**
  the request carries `Authorization: Bearer`. Cookie-authenticated requests keep the
  same-origin rule.
- A bearer token is the same random secret a web session cookie holds; only its SHA-256 is
  stored. Tokens are never logged or placed in URLs.

## Push notifications (FCM)

- Native: `@capacitor/push-notifications` (Firebase Messaging on GMS). Channels `deadlines`
  (high importance) and `general`. Permission (`POST_NOTIFICATIONS`, Android 13+) is requested
  only from Settings or a contextual prompt after Terms acceptance and sign-in.
- Registration: `PUT /api/v1/devices { installationId, platform: "android", fcmToken,
  appVersion, locale }` (authenticated). `DELETE /api/v1/devices/:installationId` on logout or
  when push is turned off. `GET /api/v1/devices` lists the caller's devices.
- Delivery: the reminder dispatcher sends a separate `native` channel through FCM HTTP v1 using
  the Worker secret `FCM_SERVICE_ACCOUNT` (service-account JSON). Payload: title/body as for Web
  Push, `data.route` (a validated in-app path such as `/tasks/<id>`), `android.notification.tag`
  = reminder job id (collapses duplicates). Invalid tokens (`UNREGISTERED`,
  `INVALID_ARGUMENT` on the token) are deleted; 429/5xx are retried by the dispatcher.

## Terms of Service

- Text: `src/client/content/terms.ts` (EN/JA), page `/terms`, version constant `TERMS_VERSION`
  in `src/shared/constants.ts`. Ordinary entry point: Settings → General → "About & legal".
- Android only: a first-launch gate (before sign-in) with an unchecked box, Accept and Decline.
  Acceptance (version + time) is stored locally; after sign-in it is also recorded on the server
  with `PUT /api/v1/terms/acceptance { version }`. A new `TERMS_VERSION` re-opens the gate.

## Files and downloads

- Import/upload use `<input type="file">`; Capacitor opens the system picker (no storage
  permission).
- Export, backups and attachments: the app fetches with the bearer token, writes the file to
  the app cache and opens the Android share sheet ("Save to Files", Drive, …). No storage
  permissions are requested.

## Permissions

Requested by the app: `INTERNET`, `POST_NOTIFICATIONS` (Android 13+, runtime prompt from Settings or the one-time contextual prompt shown after sign-in).

Merged in by Firebase Cloud Messaging and AndroidX (normal, install-time permissions; removing them breaks FCM):
`ACCESS_NETWORK_STATE`, `WAKE_LOCK`, `com.google.android.c2dm.permission.RECEIVE`, and AndroidX's
`<appId>.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` (a signature permission private to the app).
No storage, camera, microphone, location, calendar or exact-alarm permissions.
