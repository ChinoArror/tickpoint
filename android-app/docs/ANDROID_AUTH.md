# Android sign-in (AuthCenter, Custom Tabs, App Links)

Architecture and the server contract: `docs/ARCHITECTURE.md`, section "Sign-in". This document covers
the Android side and what to check on a device.

## The flow in short

1. The app creates `state` and a PKCE `verifier` (32 random bytes each, base64url) and stores them in
   Preferences (`tp.native.pkce`, 10-minute TTL, single use). It opens a Custom Tab at
   `https://point.aryuki.com/api/v1/auth/native/start?state=…&challenge=…&return=…`.
2. The Worker stores the pending login, sets a `tp_native` cookie in the Custom Tab, and redirects to
   AuthCenter. The callback is the **already registered** `https://point.aryuki.com/sso-callback`, so
   **no AuthCenter registration change is needed**.
3. After AuthCenter signs the user in, the SPA posts the AuthCenter token to the Worker. The Worker verifies
   it, mints a one-time code and returns
   `https://point.aryuki.com/app/auth-complete?code=…&state=…`.
4. The Custom Tab opens that link. Android opens the app through the verified App Link
   (`android:autoVerify`, host `point.aryuki.com`, path prefix `/app/`). If the link does not open the app,
   the public page shows **Return to TickPoint** (an `intent://` URL addressed to the package).
5. The app validates the URL (https, host `point.aryuki.com`, no port, no credentials, path
   `/app/auth-complete`, code and state match the pattern `^[A-Za-z0-9_-]{20,200}$`), checks that `state`
   equals the stored value, removes the stored login (single use), and calls
   `POST /api/v1/auth/native/exchange { code, verifier, timeZone, locale }` with `credentials: 'omit'`.
6. The token goes to the Keystore-backed `SecureStore` (AES-256-GCM, key in AndroidKeyStore, no user
   authentication required). The Custom Tab is closed, and the app opens `returnPath`.

Cancel: closing the Custom Tab rejects the in-flight sign-in with `SIGN_IN_CANCELLED`. The UI stays on
`/signin`. The stored login is kept until its TTL, so a late App Link still completes.

Cold start: if the app was launched by the link, `App.getLaunchUrl()` is handled in `init()`.

## Replay and mismatch handling

- A wrong `state` is ignored: the real in-flight login is not disturbed.
- A code is used at most once: the stored login is removed before the exchange, and the server marks the
  code used.
- An expired login (over 10 minutes) is removed and fails with `LOGIN_EXPIRED`.

## Expiry, renewal and logout

- The session ends with the AuthCenter JWT (at most 1 hour), as on the web.
- On `SESSION_EXPIRED`, the shared API client starts sign-in again. With a live AuthCenter session the
  Custom Tab returns without a prompt.
- Sign-out (`native.signOut`): the device is unregistered on the server (best effort, while the token still
  exists), local push is turned off (`PushNotifications.unregister()`), the token and stored login are removed,
  and the AuthCenter logout page opens in a Custom Tab, redirecting to `/app/signed-out`. That link closes the tab.
- The web session store calls `POST /auth/logout` first, which revokes the server session. The device DELETE
  therefore usually gets 401 and is ignored. The server also removes the device rows on logout.

## Security notes

- Tokens are never logged, never put in URLs, and never stored in Preferences or localStorage.
- `allowBackup="false"`: session data is excluded from cloud backup and device transfer.
- `usesCleartextTraffic="false"` and a network security config with `cleartextTrafficPermitted="false"`.
- No WebView form takes a password. Sign-in happens only in the system browser (Custom Tab).

## Check App Links on a device

```powershell
adb shell pm get-app-links com.aryuki.tickpoint
```

Expected: `point.aryuki.com: verified`. Android verifies the link by fetching
`https://point.aryuki.com/.well-known/assetlinks.json`, which must list package `com.aryuki.tickpoint` with
the release certificate fingerprint. Confirm it on the server:

```powershell
curl.exe -s https://point.aryuki.com/.well-known/assetlinks.json
```

If it shows `legacy_failure` or `none`, re-run the verification or fix the JSON, then
`adb shell pm verify-app-links --re-verify com.aryuki.tickpoint`.

## Open items

- The server endpoints (`/auth/native/start`, `/auth/native/exchange`, `/devices`, `/terms/acceptance`) belong
  to the Worker side and are not verified by this app build. Test sign-in end to end only after they are deployed.
- Account switching: sign-out clears the token and the device registration. A different user signing in on the
  same device gets a new session; the device row is re-created on the next push opt-in.
