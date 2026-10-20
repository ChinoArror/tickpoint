// Shared helpers for the release and verification scripts (Windows-first, also POSIX).
// Never reads or prints the signing properties: Gradle does that itself.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ANDROID_APP = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const REPO = resolve(ANDROID_APP, '..')
export const ANDROID = join(ANDROID_APP, 'android')
export const ARTIFACTS = join(ANDROID_APP, 'artifacts')
export const TEST_OUTPUT = join(ANDROID_APP, 'test-output')

export const APP_ID = 'com.aryuki.tickpoint'
export const APP_NAME = 'TickPoint'
export const BUILD_TOOLS_VERSION = '36.0.0'
/** SHA-256 of the release signing certificate (public value; the keystore itself is not in the repo). */
export const EXPECTED_CERT_SHA256 = 'B2:03:61:C2:98:27:EB:5C:6C:26:DE:14:01:7F:F3:96:69:21:E7:6C:A7:13:1D:F6:AD:80:0F:CF:49:B3:5F:20'

const isWin = process.platform === 'win32'
const DEFAULT_JAVA_HOME = 'D:/CTools/android/jdk-21'
const DEFAULT_SDK = 'D:/CTools/android/sdk'

export function sdkRoot() {
  return process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || DEFAULT_SDK
}

export function javaHome() {
  return process.env.JAVA_HOME || DEFAULT_JAVA_HOME
}

/** Environment for child processes: JAVA_HOME and ANDROID_HOME set. Secrets are never added here. */
export function toolEnv() {
  const sdk = sdkRoot()
  return { ...process.env, JAVA_HOME: javaHome(), ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk }
}

export function buildToolsDir() {
  return join(sdkRoot(), 'build-tools', BUILD_TOOLS_VERSION)
}

export function exe(name) {
  return isWin ? `${name}.exe` : name
}

/** Runs a command and returns { status, stdout, stderr }. Throws on failure when check is true. */
export function run(file, args, { cwd = ANDROID_APP, check = true, shell = false, label } = {}) {
  const res = spawnSync(file, args, { cwd, env: toolEnv(), encoding: 'utf8', shell, maxBuffer: 64 * 1024 * 1024 })
  const out = { status: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' }
  if (check && out.status !== 0) {
    const tail = `${out.stdout}\n${out.stderr}`.trim().split('\n').slice(-25).join('\n')
    throw new Error(`${label ?? file} failed (exit ${out.status})\n${tail}`)
  }
  return out
}

export function apksigner(args, opts) {
  return run(join(javaHome(), 'bin', exe('java')), ['-jar', join(buildToolsDir(), 'lib', 'apksigner.jar'), ...args], { label: 'apksigner', ...opts })
}

export function aapt2(args, opts) {
  return run(join(buildToolsDir(), exe('aapt2')), args, { label: 'aapt2', ...opts })
}

export function jarsigner(args, opts) {
  return run(join(javaHome(), 'bin', exe('jarsigner')), args, { label: 'jarsigner', ...opts })
}

export function readPackageVersion() {
  return JSON.parse(readFileSync(join(ANDROID_APP, 'package.json'), 'utf8')).version
}

export function readGradleVersion() {
  const text = readFileSync(join(ANDROID, 'app', 'build.gradle'), 'utf8')
  const name = text.match(/versionName\s+"([^"]+)"/)
  const code = text.match(/versionCode\s+(\d+)/)
  return { versionName: name?.[1] ?? null, versionCode: code ? Number(code[1]) : null }
}

export function artifactNames(version) {
  return {
    apk: `${APP_NAME}-v${version}-release.apk`,
    aab: `${APP_NAME}-v${version}-release.aab`,
  }
}

export function normalizeFingerprint(value) {
  return String(value).replace(/[^0-9a-fA-F]/g, '').toUpperCase()
}

/** Parses `aapt2 dump badging` output. */
export function parseBadging(text) {
  const pkg = text.match(/package: name='([^']+)' versionCode='([^']*)' versionName='([^']*)'/)
  // aapt2 prints minSdkVersion:'24' (and sdkVersion:'24' on older builds).
  const sdkMin = text.match(/minSdkVersion:'(\d+)'/) ?? text.match(/sdkVersion:'(\d+)'/)
  const sdkTarget = text.match(/targetSdkVersion:'(\d+)'/)
  const permissions = [...text.matchAll(/uses-permission(?:-sdk-23)?: name='([^']+)'/g)].map((m) => m[1])
  const launchable = text.match(/launchable-activity: name='([^']+)'/)
  return {
    packageName: pkg?.[1] ?? null,
    versionCode: pkg?.[2] ?? null,
    versionName: pkg?.[3] ?? null,
    minSdk: sdkMin ? Number(sdkMin[1]) : null,
    targetSdk: sdkTarget ? Number(sdkTarget[1]) : null,
    permissions: [...new Set(permissions)].sort(),
    launchableActivity: launchable?.[1] ?? null,
  }
}

export function fileExists(p) {
  return existsSync(p)
}
