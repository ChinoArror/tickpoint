#!/usr/bin/env node
// Captures the screenshots used by the help guide (/docs) from a running local
// dev server (npm run dev) signed in with the development identity.
//
//   node scripts/docs-screenshots.mjs [baseUrl]
//
// Requires DEV_AUTH_BYPASS=true in .dev.vars and a seeded demo workspace.
// Output: public/docs-media/<locale>/<name>.jpg (light theme, both locales).

import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const BASE = process.argv[2] ?? 'http://localhost:5173'
const OUT = 'public/docs-media'
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'msedge', headless: true })

async function api(page, method, path, body) {
  return page.evaluate(
    async ([m, p, b]) => {
      const r = await fetch('/api/v1' + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
      return r.json()
    },
    [method, path, body],
  )
}

async function context(locale, mobile) {
  const ctx = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    deviceScaleFactor: mobile ? 2 : 1.5,
    isMobile: mobile,
    hasTouch: mobile,
    locale: locale === 'ja' ? 'ja-JP' : 'en-US',
    timezoneId: 'Asia/Tokyo',
    reducedMotion: 'reduce',
    colorScheme: 'light',
  })
  await ctx.addInitScript((l) => {
    localStorage.setItem('tp.locale', l)
    localStorage.setItem('tp.theme', 'light')
    localStorage.setItem('tp.hadSession', '1')
    localStorage.setItem('tp.installDismissed', '1')
  }, locale)
  const page = await ctx.newPage()
  await page.goto(BASE + '/signin')
  await api(page, 'POST', '/auth/dev-login', { user: 'alice', timeZone: 'Asia/Tokyo', locale })
  await api(page, 'PATCH', '/settings', { locale, theme: 'light' })
  return { ctx, page }
}

async function shot(page, locale, name, path, prepare) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  if (prepare) await prepare(page)
  await page.waitForTimeout(600)
  mkdirSync(`${OUT}/${locale}`, { recursive: true })
  await page.screenshot({ path: `${OUT}/${locale}/${name}.jpg`, type: 'jpeg', quality: 82 })
  console.log(`${locale}/${name}.jpg`)
}

for (const locale of ['en', 'ja']) {
  const { ctx, page } = await context(locale, false)
  const deadlines = await api(page, 'GET', '/tasks?view=deadlines')
  const poster = deadlines.data.items.find((t) => t.title.startsWith('Final poster'))?.id
  const drafts = { capture: process.env.CAPTURE_DRAFT, plan: process.env.PLAN_DRAFT }

  await shot(page, locale, 'overview', '/')
  await shot(page, locale, 'capture-paste', '/capture', async (p) => {
    await p.locator('textarea').first().fill(
      locale === 'ja'
        ? '【デザイン演習II 最終課題】\n参加登録：2026年10月20日まで\n最終提出：A2ポスター（PDF）と2分の動画を、2026年11月10日 23:59（日本時間）までに授業ポータルへ提出。\n講評会：11月14日（時間未定）'
        : 'Design Studio II — Final Project\nRegistration: by October 20, 2026.\nFinal submission: upload the A2 poster (PDF) and a 2-minute video to the course portal before 23:59 JST on November 10, 2026.\nCritique: November 14, time to be announced.',
    )
  })
  if (drafts.capture) await shot(page, locale, 'capture-review', `/capture/${drafts.capture}`)
  if (poster) await shot(page, locale, 'task-detail', `/tasks/${poster}`)
  if (drafts.plan) await shot(page, locale, 'plan', `/plan/${drafts.plan}`)
  await shot(page, locale, 'today', '/today')
  await shot(page, locale, 'calendar', '/calendar')
  await shot(page, locale, 'goals', '/goals')
  await shot(page, locale, 'analytics', '/analytics', async (p) => {
    await p.getByRole('heading', { name: locale === 'ja' ? /アクティビティ/ : /Activity calendar/ }).scrollIntoViewIfNeeded().catch(() => undefined)
    await p.mouse.wheel(0, -120)
  })
  await shot(page, locale, 'settings-notifications', '/settings/notifications')
  await ctx.close()

  const m = await context(locale, true)
  await shot(m.page, locale, 'mobile-overview', '/')
  await shot(m.page, locale, 'mobile-today', '/today')
  await m.ctx.close()
}

await browser.close()
