# Android push notifications (FCM)

Push uses **Firebase Cloud Messaging** through `@capacitor/push-notifications` on Google Play services.
The Worker sends FCM HTTP v1 messages. There is no polling, no foreground timer and no Web Push fallback
on Android.

## Status of this build

The app builds and runs **without** `google-services.json`. The push screen then shows **"Unavailable"**
(`AppSettings.pushSupport()` reports `no_firebase`). This is deliberate: the app never claims push works
when it cannot.

Push is only functional after the Firebase steps below are done and the Worker secret is set.

## 1. Firebase Console

1. Open the Firebase console, create or select the project for TickPoint.
2. Add an **Android app** with package name **`com.aryuki.tickpoint`**. Use the release certificate
   SHA-256 from `docs/ANDROID_SIGNING.md` (add the debug SHA-1/256 too for local development builds if you
   need them).
3. Download **`google-services.json`** and place it at `android-app/android/app/google-services.json`.
   It is listed in `android-app/.gitignore`, so it is not committed. It holds Firebase project identifiers and a
   client API key, which Firebase restricts; keep it out of commits anyway.
4. Rebuild with `npm run release` (or `npm run sync` followed by a debug build). The Gradle plugin
   `com.google.gms.google-services` is applied automatically when the file exists.

## 2. Service account for the Worker

1. In Google Cloud (the Firebase project), create a service account with the
   **Firebase Cloud Messaging API Admin** role (`roles/firebasemessaging.admin`), or the narrowest role
   that can send FCM HTTP v1 messages.
2. Create a JSON key. Store it outside the repo.
3. Set it as a Worker secret from the repo root (the file is read from stdin, never from the repo):

   ```powershell
   npx wrangler secret put FCM_SERVICE_ACCOUNT < C:\path\outside\repo\service-account.json
   ```

4. Delete the local JSON key after the secret is set, or move it to the encrypted backup.

The secret is never logged. Its contents never reach the Vue assets, the APK or Git.

## 3. Notification channels

The app creates two channels on the device when the user turns push on:

| Channel id | Name (EN) | Importance | Lock screen |
|---|---|---|---|
| `deadlines` | Deadlines & reminders | High (4) | Private (generic text) |
| `general` | General notices | Default (3) | Private |

`deadlines` is the default channel for FCM messages (`default_notification_channel_id` in the
manifest). Small icon: `ic_stat_tickpoint` (white monochrome arc and check). Accent: `#4f46e5`.

Payload rules (the Worker must send these; the device re-checks the route before it navigates):

- Title and body contain no secrets, tokens or sensitive task content beyond a short reminder.
- `data.route` must match `^/[A-Za-z0-9/_-]{0,200}$` and must not start with `//`. The app opens `/` otherwise.
- `android.notification.tag` is the reminder job id, so duplicates collapse.

## 4. Device registration

- Sign-in or turn-on: the app asks for `POST_NOTIFICATIONS` (Android 13+) only after Terms acceptance and
  sign-in, from the Settings toggle.
- Registration: `PUT /api/v1/devices { installationId, platform: "android", fcmToken, appVersion, locale }`
  with the bearer token. `installationId` is a random id stored once per install.
- Refresh: on every app start and on resume, when push is on and permission is granted, the app calls
  `PushNotifications.register()` again. Token refresh then reaches the server through the `registration` event.
- Removal: turning push off, and signing out, call `DELETE /api/v1/devices/:installationId` (best effort),
  then `PushNotifications.unregister()`, which deletes the FCM token on the device.
- `registrationError`, or no Google services, reports **unavailable**. Nothing is claimed as working.

## 5. Limits you must document for users

- FCM accepts a message. Delivery is best effort. There is no guarantee of exact-second timing.
- A force-stopped app receives no push until the user opens it again.
- Battery optimisation and Doze can delay messages. Reminders may arrive late on some OEM devices.
- Devices without Google Play services (some Huawei and custom ROMs) cannot receive FCM. The app shows
  "Unavailable" there.
- Exact alarms are not used. The app does not request `SCHEDULE_EXACT_ALARM`.

## 6. Test matrix (to run on real devices)

Covered by automated checks: none of the delivery paths can be automated without the Firebase project.
Run manually on at least one Google Play services phone and one Android 13+ device:

| Case | How | Expected |
|---|---|---|
| Foreground message | Send from the Worker while the app is open | In-app toast with the title |
| Background message | Home screen, send | Notification in the `deadlines` channel |
| Process killed (not force-stop) | Swipe away from recents, send | Notification appears |
| Force-stopped | Settings → Force stop, send | No notification until the app is opened |
| Locked device | Lock the screen, send | Generic text on the lock screen |
| Permission denied | Deny at the prompt | Settings shows **Blocked** and the Android settings button |
| Permission later revoked | Revoke in Android settings, reopen | Status updates to Blocked |
| Token refresh | Clear app data on a test device, reopen | New registration reaches the server |
| Logout | Sign out, send | No notification on that device |
| Account switch | Sign in as another user on the same device | Old user's device row is gone |
| Cold-start tap | Tap a notification while the app is closed | Opens the route from `data.route` |
| Invalid route | Payload route `//evil` | Opens `/` |
| Offline | Airplane mode, then online | Toast when offline; registration retried on next start |
| No GMS | Emulator image without Play services | Push shows **Unavailable** |

## 7. Emulator note

The emulator image `google_apis_playstore` has Play services, but without `google-services.json` push
still reports **Unavailable** (`no_firebase`). A full FCM test needs the real Firebase project.
