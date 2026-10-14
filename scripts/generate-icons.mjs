#!/usr/bin/env node
// Renders the app icons in public/icons from one SVG source.
//
//   node scripts/generate-icons.mjs
//
// apple-touch-icon and the maskable icon are full-bleed squares: iOS and Android
// apply their own corner mask, so any rounding or transparent margin baked into
// the PNG shows up as a light rim on the home screen.

import { copyFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const OUT = 'public/icons'

/** Flat brand square with a single white mark (progress arc + check), like other first-party app icons. */
function svg({ size, radius = 0, mark = 0.56 }) {
  const s = mark // mark size relative to the canvas
  const o = (1 - s) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6366f1"/>
      <stop offset="1" stop-color="#4f46e5"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" rx="${radius}" fill="url(#bg)"/>
  <g transform="translate(${o * 100} ${o * 100}) scale(${s})" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">
    <path d="M50 8 A42 42 0 1 1 20.3 20.3" stroke-width="10"/>
    <path d="M31 51 L44.5 64.5 L70 37" stroke-width="11"/>
  </g>
</svg>`
}

const icons = [
  { file: 'apple-touch-icon.png', size: 180, opts: {} },
  { file: 'icon-maskable-512.png', size: 512, opts: { mark: 0.46 } },
  { file: 'icon-192.png', size: 192, opts: { radius: 22 } },
  { file: 'icon-512.png', size: 512, opts: { radius: 22 } },
]

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'msedge', headless: true })
const page = await browser.newPage()
for (const { file, size, opts } of icons) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg({ size, ...opts })}</body></html>`)
  // Full-bleed icons are opaque (iOS fills transparency with black or white).
  await page.locator('svg').screenshot({ path: `${OUT}/${file}`, omitBackground: Boolean(opts.radius) })
  console.log(`${OUT}/${file}`)
}
await browser.close()
// iOS also probes /apple-touch-icon.png at the site root.
copyFileSync(`${OUT}/apple-touch-icon.png`, 'public/apple-touch-icon.png')
