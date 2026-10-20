#!/usr/bin/env node
// Optional helper: boots an Android emulator headless, installs the release APK from
// android-app/artifacts, launches the app and saves screenshots to android-app/test-output/.
//
//   node scripts/emulator-test.mjs              create AVD if missing, boot, install, launch, screenshot
//   node scripts/emulator-test.mjs shot <name>  screenshot of the running device
//   node scripts/emulator-test.mjs tap <x> <y>  tap in device pixels
//   node scripts/emulator-test.mjs stop         kill the emulator
//
// Needs: ANDROID_HOME (platform-tools, emulator, cmdline-tools, system image
// "system-images;android-36;google_apis_playstore;x86_64"), and WHPX/KVM acceleration.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ARTIFACTS, TEST_OUTPUT, APP_ID, artifactNames, readPackageVersion, run, sdkRoot, toolEnv } from './lib/android.mjs'

const AVD = 'tickpoint_api36'
const SYSTEM_IMAGE = 'system-images;android-36;google_apis_playstore;x86_64'
const isWin = process.platform === 'win32'
const sdk = sdkRoot()
const adb = join(sdk, 'platform-tools', isWin ? 'adb.exe' : 'adb')
const emulatorBin = join(sdk, 'emulator', isWin ? 'emulator.exe' : 'emulator')

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function adbRun(args, opts) {
  return run(adb, args, { check: false, ...opts })
}

function bootCompleted() {
  const res = adbRun(['shell', 'getprop', 'sys.boot_completed'])
  return res.status === 0 && res.stdout.trim() === '1'
}

async function waitForBoot(timeoutMs = 600_000) {
  const end = Date.now() + timeoutMs
  adbRun(['wait-for-device'])
  while (Date.now() < end) {
    if (bootCompleted()) return
    await sleep(3000)
  }
  throw new Error('Emulator did not finish booting in time.')
}

function ensureAvd() {
  const list = run(join(sdk, 'emulator', isWin ? 'emulator.exe' : 'emulator'), ['-list-avds'], { check: false })
  if (list.stdout.split(/\r?\n/).map((s) => s.trim()).includes(AVD)) return
  const avdmanager = join(sdk, 'cmdline-tools', 'latest', 'bin', isWin ? 'avdmanager.bat' : 'avdmanager')
  if (!existsSync(avdmanager)) throw new Error(`avdmanager not found at ${avdmanager}`)
  const create = isWin
    ? run('cmd', ['/c', avdmanager, 'create', 'avd', '-n', AVD, '-k', SYSTEM_IMAGE, '-d', 'pixel_7', '--force'], { check: true, label: 'avdmanager' })
    : run(avdmanager, ['create', 'avd', '-n', AVD, '-k', SYSTEM_IMAGE, '-d', 'pixel_7', '--force'], { check: true, label: 'avdmanager' })
  console.log(create.stdout.trim().split('\n').slice(-2).join('\n'))
}

function startEmulator() {
  const child = spawn(emulatorBin, ['-avd', AVD, '-no-window', '-no-snapshot', '-no-audio', '-no-boot-anim', '-gpu', 'swiftshader_indirect'], {
    detached: true,
    stdio: 'ignore',
    env: toolEnv(),
  })
  child.unref()
  console.log(`emulator started (pid ${child.pid})`)
}

function shot(name) {
  mkdirSync(TEST_OUTPUT, { recursive: true })
  // Raw bytes: the PNG must not go through a text decoder.
  const res = spawnSync(adb, ['exec-out', 'screencap', '-p'], { env: toolEnv(), maxBuffer: 64 * 1024 * 1024 })
  if (res.status !== 0 || !res.stdout?.length) throw new Error('screencap failed')
  const out = join(TEST_OUTPUT, `${name}.png`)
  writeFileSync(out, res.stdout)
  console.log(out)
  return out
}

async function main() {
  const cmd = process.argv[2] ?? 'boot'
  if (cmd === 'shot') return void shot(process.argv[3] ?? `shot-${Date.now()}`)
  if (cmd === 'tap') return void adbRun(['shell', 'input', 'tap', process.argv[3], process.argv[4]], { check: true })
  if (cmd === 'stop') return void adbRun(['emu', 'kill'])

  ensureAvd()
  const online = adbRun(['devices']).stdout.split('\n').some((l) => /\temulator-\d+\s+device/.test(l))
  if (!online) {
    startEmulator()
    await waitForBoot()
  }
  const version = readPackageVersion()
  const apk = join(ARTIFACTS, artifactNames(version).apk)
  if (!existsSync(apk)) throw new Error(`Missing ${apk}. Run "npm run release" first.`)
  run(adb, ['install', '-r', apk], { label: 'adb install' })
  adbRun(['shell', 'am', 'start', '-n', `${APP_ID}/.MainActivity`], { check: true })
  await sleep(6000)
  shot('launch')
  console.log(`launched ${APP_ID} ${version}. Emulator left running (use "stop" to shut it down).`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`EMULATOR TEST FAILED: ${e.message}`)
    process.exit(1)
  })
}

