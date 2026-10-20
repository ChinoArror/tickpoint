# Android release signing

The release APK/AAB is signed with a long-lived **upload key**. Never ship a debug-signed build.

## Where the key is

| Item | Location | In Git? |
|---|---|---|
| Keystore | `C:\Users\Qwer\.tickpoint-signing\tickpoint-release.jks` | No (outside the repo) |
| Properties file | `C:\Users\Qwer\.tickpoint-signing\keystore.properties` | No |
| Public certificate SHA-256 | `B2:03:61:C2:98:27:EB:5C:6C:26:DE:14:01:7F:F3:96:69:21:E7:6C:A7:13:1D:F6:AD:80:0F:CF:49:B3:5F:20` | Yes (this doc, `public/.well-known/assetlinks.json`) |

The properties file has four keys: `storeFile`, `storePassword`, `keyAlias`, `keyPassword`. Do not paste
its values into chat, logs, tickets or commits. To check that the keys exist without showing the values:

```powershell
Get-Content C:\Users\Qwer\.tickpoint-signing\keystore.properties | ForEach-Object { ($_ -split '=')[0] }
```

Gradle (`android/app/build.gradle`) reads the file. Lookup order:

1. the env var `TICKPOINT_SIGNING_PROPS` (absolute path to the properties file), or
2. `<user.home>/.tickpoint-signing/keystore.properties`.

If the file or a key is missing, a release task fails with a clear message. There is no fallback to the
debug key.

## Back up the key (required)

Losing the keystore or its passwords means existing installs can never be updated. Users would have
to uninstall, losing local data. Back up **both** files:

1. Copy `tickpoint-release.jks` and `keystore.properties` to an **encrypted** backup, for example
   a password manager's file attachment or an encrypted archive
   (`7z a -p -mhe=on tickpoint-signing.7z ...`), stored offline and in a second location.
2. Store the store and key passwords in an offline password manager entry. Keep them out of the repo and
   out of plain notes.
3. Test the restore: decrypt the copy into an empty folder and run `npm run release` with
   `TICKPOINT_SIGNING_PROPS` pointing at it. The resulting certificate fingerprint must match the value above.

## Upload key and Google Play App Signing

Google Play recommends **Play App Signing**: Google holds the app-signing key, and this keystore is the
**upload key**. If the upload key is lost, Google can reset it (through Play Console support). Without
Play App Signing, a lost key cannot be recovered. Enrolling in Play App Signing requires uploading an AAB
signed with this key the first time. The AAB is produced at `artifacts/TickPoint-v<version>-release.aab`.

This repository does not publish to Google Play. Publishing is a manual decision.

## Rotating the key

Rotation changes the signing identity. For an app that is already installed, only a key from the
original lineage can update it (APK Signature Scheme key rotation, `apksigner rotate`). Plan rotation
before the first public release, not after.

Steps (only if the key is compromised):

1. Create a new keystore with `keytool -genkeypair` (RSA 4096 or EC P-256, validity 25+ years).
2. Update `keystore.properties` and back up the new key as above.
3. Update the App Links fingerprint in `public/.well-known/assetlinks.json` and redeploy the Worker
   (App Links verification fails otherwise).
4. Inform users that updating requires a reinstall, unless lineage rotation was planned.

## CI secrets (optional, future)

No CI workflow exists yet. If one is added, store these as encrypted repository secrets, never as files
in the repo:

- `TICKPOINT_KEYSTORE_B64`: `base64` of the `.jks` file.
- `TICKPOINT_STORE_PASSWORD`, `TICKPOINT_KEY_ALIAS`, `TICKPOINT_KEY_PASSWORD`.

The job decodes the keystore into a temporary file (outside the workspace), writes a properties file to
`$RUNNER_TEMP`, sets `TICKPOINT_SIGNING_PROPS` to that path, runs `npm run release`, and deletes the
temporary files. Do not echo the secrets. Use masked variables.

## Verifying a signed build

`npm run verify` runs `apksigner verify --print-certs` and `jarsigner -verify` on the artifacts, checks
that the signer equals the public fingerprint above, and fails on the debug certificate
(`CN=Android Debug`).
