#!/usr/bin/env node
// Renders the raster Android assets from the same design as public/icons (scripts/generate-icons.mjs):
//   - legacy launcher PNGs (Android 7.x and older, minSdk 24 needs them): ic_launcher / ic_launcher_round
//   - splash PNGs for devices without the Android 12 SplashScreen API (drawable/splash, port/land)
// Adaptive icon layers and the status-bar icon are vector XML (android/app/src/main/res/drawable).
//
//   node scripts/generate-android-assets.mjs
//
// Needs a local Chromium channel: PW_CHANNEL=msedge (default) or chrome.

import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const RES = resolve(here, '..', 'android', 'app', 'src', 'main', 'res')
const REPO_PLAYWRIGHT = resolve(here, '..', '..', 'node_modules', 'playwright-core', 'index.mjs')
const { chromium } = await import(pathToFileURL(REPO_PLAYWRIGHT).href)

/** Same glyph as scripts/generate-icons.mjs: progress arc + check, on a 100-unit canvas. */
function glyph(markScale) {
  const o = (1 - markScale) / 2
  return `<g transform="translate(${o * 100} ${o * 100}) scale(${markScale})" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">
    <path d="M50 8 A42 42 0 1 1 20.3 20.3" stroke-width="10"/>
    <path d="M31 51 L44.5 64.5 L70 37" stroke-width="11"/>
  </g>`
}

const gradient = `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#4f46e5"/></linearGradient></defs>`

function launcherSvg(size, shape) {
  const clip = shape === 'round' ? '50' : '22'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  ${gradient}
  <rect width="100" height="100" rx="${clip}" fill="url(#bg)"/>
  ${glyph(0.56)}
</svg>`
}

function splashSvg(width, height) {
  const s = Math.min(width, height) * 0.22
  const cx = width / 2 - s / 2
  const cy = height / 2 - s / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#f8f9fb"/>
  <svg x="${cx}" y="${cy}" width="${s}" height="${s}" viewBox="0 0 100 100">
    <g fill="none" stroke="#4f46e5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M50 8 A42 42 0 1 1 20.3 20.3" stroke-width="10"/>
      <path d="M31 51 L44.5 64.5 L70 37" stroke-width="11"/>
    </g>
  </svg>
</svg>`
}

const LEGACY = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }
const SPLASH = {
  mdpi: [320, 480],
  hdpi: [480, 800],
  xhdpi: [720, 1280],
  xxhdpi: [960, 1600],
  xxxhdpi: [1280, 1920],
}

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'msedge', headless: true })
const page = await browser.newPage()

async function render(svg, width, height, outPath, omitBackground) {
  mkdirSync(dirname(outPath), { recursive: true })
  await page.setViewportSize({ width, height })
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`)
  await page.locator('svg').first().screenshot({ path: outPath, omitBackground })
  console.log(outPath.replace(RES, 'res'))
}

for (const [density, size] of Object.entries(LEGACY)) {
  const dir = join(RES, `mipmap-${density}`)
  await render(launcherSvg(size, 'square'), size, size, join(dir, 'ic_launcher.png'), true)
  await render(launcherSvg(size, 'round'), size, size, join(dir, 'ic_launcher_round.png'), true)
}

for (const [density, [w, h]] of Object.entries(SPLASH)) {
  await render(splashSvg(w, h), w, h, join(RES, `drawable-port-${density}`, 'splash.png'), false)
  await render(splashSvg(h, w), h, w, join(RES, `drawable-land-${density}`, 'splash.png'), false)
}
await render(splashSvg(480, 800), 480, 800, join(RES, 'drawable', 'splash.png'), false)

await browser.close()
