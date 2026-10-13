// Localized notification copy (English + Japanese only).

import type { Locale } from '../../shared/constants'

type Kind = 'reminder' | 'test'

interface Copy {
  reminderTitle: (title: string) => string
  reminderBody: (when: string) => string
  reminderBodyNoDate: string
  testTitle: string
  testBody: string
  emailFooter: string
  open: string
}

const COPY: Record<Locale, Copy> = {
  en: {
    reminderTitle: (t) => `Reminder: ${t}`,
    reminderBody: (w) => `Due ${w}`,
    reminderBodyNoDate: 'You asked TickPoint to remind you about this.',
    testTitle: 'TickPoint test notification',
    testBody: 'Notifications are working. Make every moment count.',
    emailFooter: 'You received this because reminders are enabled in your TickPoint settings.',
    open: 'Open in TickPoint',
  },
  ja: {
    reminderTitle: (t) => `リマインダー：${t}`,
    reminderBody: (w) => `締め切り：${w}`,
    reminderBodyNoDate: 'TickPoint で設定したリマインダーです。',
    testTitle: 'TickPoint テスト通知',
    testBody: '通知は正常に届いています。',
    emailFooter: 'TickPoint の設定でリマインダーが有効になっているため、このメールをお送りしています。',
    open: 'TickPoint で開く',
  },
}

export function copyFor(locale: string): Copy {
  return COPY[(locale === 'ja' ? 'ja' : 'en') as Locale]
}

export function formatWhen(instant: number, locale: string, timeZone: string, dateOnly: boolean): string {
  const loc = locale === 'ja' ? 'ja-JP' : 'en-US'
  return new Intl.DateTimeFormat(loc, {
    timeZone,
    year: 'numeric',
    month: locale === 'ja' ? '2-digit' : 'short',
    day: '2-digit',
    ...(dateOnly ? {} : { hour: '2-digit', minute: '2-digit', hour12: locale !== 'ja' }),
    ...(dateOnly ? {} : { timeZoneName: 'short' }),
  }).format(new Date(instant))
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export function renderEmail(locale: string, kind: Kind, title: string, body: string, url: string) {
  const c = copyFor(locale)
  const html = `<!doctype html><html lang="${locale === 'ja' ? 'ja' : 'en'}"><body style="margin:0;background:#f6f7f9;font-family:-apple-system,Segoe UI,Hiragino Sans,Yu Gothic,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border:1px solid #e5e7eb;border-radius:12px"><tr><td style="padding:28px">
<div style="font-size:13px;color:#4f46e5;font-weight:600;letter-spacing:.02em">TickPoint</div>
<h1 style="font-size:20px;margin:12px 0 8px">${esc(title)}</h1>
<p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 20px">${esc(body)}</p>
<a href="${esc(url)}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600">${esc(c.open)}</a>
<p style="font-size:12px;color:#6b7280;margin:24px 0 0">${esc(c.emailFooter)}</p>
</td></tr></table></td></tr></table></body></html>`
  const text = `${title}\n\n${body}\n\n${c.open}: ${url}\n\n${c.emailFooter}`
  return { subject: kind === 'test' ? c.testTitle : title, html, text }
}
