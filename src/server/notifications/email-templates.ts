// Branded, localized transactional email templates (English + Japanese).
// Email clients ignore <style> blocks and modern CSS inconsistently, so every
// style is inline and layout uses nested tables. Images are absolute URLs.

type Locale = 'en' | 'ja'

const C = {
  canvas: '#eef0f8',
  card: '#ffffff',
  ink: '#151a2d',
  body: '#3f4659',
  muted: '#6b7286',
  faint: '#9aa0b2',
  line: '#e6e8f0',
  primary: '#4f46e5',
  primaryDeep: '#4338ca',
  primarySoft: '#eef0ff',
  danger: '#d92d4b',
  dangerSoft: '#fff0f2',
  warning: '#b45309',
  warningSoft: '#fff7e6',
  success: '#15803d',
}
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI','Hiragino Sans','Hiragino Kaku Gothic ProN','Yu Gothic UI',Meiryo,'Noto Sans JP',Roboto,Helvetica,Arial,sans-serif"

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const L = {
  en: {
    tagline: 'Make every moment count.',
    open: 'Open in TickPoint',
    manage: 'Notification settings',
    why: 'You are receiving this because email reminders are turned on for this address in TickPoint.',
    whyVerify: 'Someone (hopefully you) added this address to TickPoint. If that was not you, you can ignore this email.',
    reminderEyebrow: 'Reminder',
    overdueEyebrow: 'Overdue',
    due: 'Due',
    target: 'Target date',
    progress: 'Progress',
    next: 'Next checkpoints',
    priority: 'Priority',
    project: 'Project',
    verifySubject: 'Your TickPoint verification code',
    verifyTitle: 'Confirm your email address',
    verifyIntro: 'Enter this code in TickPoint to start receiving reminders at this address.',
    verifyButton: 'Verify this address',
    verifyExpires: (m: number) => `The code expires in ${m} minutes.`,
    testSubject: 'TickPoint test email',
    testTitle: 'Email notifications are working',
    testIntro: 'This is a test from TickPoint. Reminders for your deadlines and checkpoints will look like this.',
  },
  ja: {
    tagline: 'すべての瞬間を、確かな前進に。',
    open: 'TickPoint で開く',
    manage: '通知の設定',
    why: 'TickPoint でこのアドレスへのメールリマインダーが有効になっているため、お送りしています。',
    whyVerify: 'このアドレスが TickPoint に追加されました。お心当たりがない場合は、このメールを破棄してください。',
    reminderEyebrow: 'リマインダー',
    overdueEyebrow: '期限切れ',
    due: '締め切り',
    target: '目標日',
    progress: '進捗',
    next: '次のチェックポイント',
    priority: '優先度',
    project: 'プロジェクト',
    verifySubject: 'TickPoint 確認コード',
    verifyTitle: 'メールアドレスの確認',
    verifyIntro: 'このアドレスでリマインダーを受け取るには、TickPoint で次のコードを入力してください。',
    verifyButton: 'このアドレスを確認する',
    verifyExpires: (m: number) => `コードの有効期限は ${m} 分です。`,
    testSubject: 'TickPoint テストメール',
    testTitle: 'メール通知は正常に動作しています',
    testIntro: 'TickPoint からのテストメールです。締め切りやチェックポイントのリマインダーはこのように届きます。',
  },
}

export function copy(locale: string) {
  return L[(locale === 'ja' ? 'ja' : 'en') as Locale]
}

interface LayoutArgs {
  locale: string
  origin: string
  preheader: string
  eyebrow: string
  eyebrowTone?: 'primary' | 'danger'
  title: string
  intro?: string
  inner: string
  cta?: { label: string; url: string }
  footnote: string
}

function button(label: string, url: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 4px"><tr><td style="border-radius:12px;background:${C.primary};background-image:linear-gradient(135deg,#6366f1,${C.primaryDeep})" bgcolor="${C.primary}">
<a href="${esc(url)}" target="_blank" style="display:inline-block;padding:13px 22px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:12px">${esc(label)} &rarr;</a></td></tr></table>`
}

export function layout(a: LayoutArgs): string {
  const c = copy(a.locale)
  const eyebrowColor = a.eyebrowTone === 'danger' ? C.danger : C.primary
  const eyebrowBg = a.eyebrowTone === 'danger' ? C.dangerSoft : C.primarySoft
  const settings = new URL('/settings/notifications', a.origin).toString()
  return `<!doctype html>
<html lang="${a.locale === 'ja' ? 'ja' : 'en'}" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(a.title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.canvas};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${esc(a.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.canvas}" style="background:${C.canvas};background-image:radial-gradient(circle at 15% 0%,#dfe2fb 0,rgba(223,226,251,0) 42%),radial-gradient(circle at 100% 10%,#ece2fb 0,rgba(236,226,251,0) 38%)">
<tr><td align="center" style="padding:36px 14px 40px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
    <!-- Brand -->
    <tr><td style="padding:0 6px 18px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="vertical-align:middle"><img src="${new URL('/icons/icon-192.png', a.origin)}" width="32" height="32" alt="" style="display:block;border:0;border-radius:9px"></td>
        <td style="vertical-align:middle;padding-left:10px;font-family:${FONT};font-size:17px;font-weight:700;letter-spacing:-0.2px;color:${C.ink}">Tick<span style="color:${C.primary}">Point</span></td>
      </tr></table>
    </td></tr>
    <!-- Card -->
    <tr><td style="background:${C.card};border-radius:20px;border:1px solid ${C.line};box-shadow:0 18px 40px -18px rgba(40,44,90,0.28);overflow:hidden">
      <div style="height:5px;line-height:5px;font-size:0;background:${C.primary};background-image:linear-gradient(90deg,#6366f1,#8b5cf6 55%,#06b6d4);border-radius:20px 20px 0 0">&nbsp;</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:30px 32px 32px">
        <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${eyebrowBg};font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:0.3px;color:${eyebrowColor}">${esc(a.eyebrow)}</span>
        <h1 style="margin:14px 0 0;font-family:${FONT};font-size:23px;line-height:1.3;font-weight:700;letter-spacing:-0.3px;color:${C.ink}">${esc(a.title)}</h1>
        ${a.intro ? `<p style="margin:10px 0 0;font-family:${FONT};font-size:15px;line-height:1.65;color:${C.body}">${esc(a.intro)}</p>` : ''}
        ${a.inner}
        ${a.cta ? button(a.cta.label, a.cta.url) : ''}
      </td></tr></table>
    </td></tr>
    <!-- Footer -->
    <tr><td style="padding:22px 10px 0;text-align:center;font-family:${FONT}">
      <p style="margin:0;font-size:13px;font-weight:600;color:${C.muted}">${esc(c.tagline)}</p>
      <p style="margin:8px 0 0;font-size:12px;line-height:1.6;color:${C.faint}">${esc(a.footnote)}</p>
      <p style="margin:10px 0 0;font-size:12px"><a href="${esc(settings)}" style="color:${C.primary};text-decoration:none">${esc(c.manage)}</a> <span style="color:${C.faint}">&nbsp;·&nbsp;</span> <a href="${esc(a.origin)}" style="color:${C.primary};text-decoration:none">point.aryuki.com</a></p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Reminder
// ---------------------------------------------------------------------------

export interface ReminderEmailData {
  locale: string
  origin: string
  title: string
  link: string
  kind: 'task' | 'deadline' | 'goal' | 'checkpoint'
  overdue: boolean
  /** e.g. "Fri, Nov 14, 2026, 11:59 PM" */
  whenLabel: string | null
  /** e.g. "Asia/Tokyo (JST)", omitted for date-only targets */
  zoneLabel: string | null
  /** e.g. "Due in 1 day 3 hours" / "Overdue by 2 hours" */
  relativeLabel: string | null
  progressPercent: number | null
  priorityLabel: string | null
  projectName: string | null
  nextCheckpoints: { title: string; dateLabel: string | null }[]
  parentTitle?: string | null
}

export function reminderEmail(d: ReminderEmailData) {
  const c = copy(d.locale)
  const accent = d.overdue ? C.danger : C.primary
  const whenBlock = d.whenLabel
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;border-radius:14px;background:${d.overdue ? C.dangerSoft : '#f6f7fc'};border:1px solid ${d.overdue ? '#ffd3da' : C.line}">
<tr><td style="padding:16px 18px;font-family:${FONT}">
  <p style="margin:0;font-size:12px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;color:${C.muted}">${esc(d.kind === 'goal' || d.kind === 'checkpoint' ? c.target : c.due)}</p>
  <p style="margin:6px 0 0;font-size:19px;font-weight:700;color:${C.ink}">${esc(d.whenLabel)}</p>
  ${d.zoneLabel ? `<p style="margin:3px 0 0;font-size:13px;color:${C.muted}">${esc(d.zoneLabel)}</p>` : ''}
  ${d.relativeLabel ? `<p style="margin:10px 0 0;font-size:14px;font-weight:600;color:${accent}">&#9201;&nbsp; ${esc(d.relativeLabel)}</p>` : ''}
</td></tr></table>`
    : ''

  const meta = [d.priorityLabel ? [c.priority, d.priorityLabel] : null, d.projectName ? [c.project, d.projectName] : null].filter(Boolean) as string[][]
  const metaBlock = meta.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px"><tr>${meta
        .map(([k, v]) => `<td style="padding-right:18px;font-family:${FONT}"><p style="margin:0;font-size:12px;color:${C.faint}">${esc(k)}</p><p style="margin:2px 0 0;font-size:14px;font-weight:600;color:${C.body}">${esc(v)}</p></td>`)
        .join('')}</tr></table>`
    : ''

  const pct = d.progressPercent == null ? null : Math.max(0, Math.min(100, Math.round(d.progressPercent)))
  const progressBlock =
    pct == null
      ? ''
      : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px"><tr><td style="font-family:${FONT};font-size:13px;color:${C.muted}">${esc(c.progress)}</td><td align="right" style="font-family:${FONT};font-size:13px;font-weight:700;color:${C.ink}">${pct}%</td></tr>
<tr><td colspan="2" style="padding-top:8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius:999px;background:#e9ebf5"><tr>
${pct > 0 ? `<td width="${pct}%" style="height:8px;line-height:8px;font-size:0;border-radius:999px;background:${C.primary};background-image:linear-gradient(90deg,#6366f1,#8b5cf6)">&nbsp;</td>` : ''}${pct < 100 ? `<td style="height:8px;line-height:8px;font-size:0">&nbsp;</td>` : ''}
</tr></table></td></tr></table>`

  const cpBlock = d.nextCheckpoints.length
    ? `<p style="margin:24px 0 8px;font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;color:${C.muted}">${esc(c.next)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${d.nextCheckpoints
        .map(
          (cp) => `<tr><td width="22" valign="top" style="padding:7px 0;font-family:${FONT};font-size:14px;color:${C.primary}">&#9675;</td>
<td style="padding:7px 0;border-bottom:1px solid ${C.line};font-family:${FONT};font-size:14px;color:${C.body}">${esc(cp.title)}${cp.dateLabel ? `<span style="color:${C.faint};font-size:12px">&nbsp;&nbsp;${esc(cp.dateLabel)}</span>` : ''}</td></tr>`,
        )
        .join('')}</table>`
    : ''

  const parent = d.parentTitle ? `<p style="margin:6px 0 0;font-family:${FONT};font-size:13px;color:${C.muted}">${esc(d.parentTitle)}</p>` : ''
  const eyebrow = d.overdue ? c.overdueEyebrow : c.reminderEyebrow
  const subject = d.locale === 'ja' ? `${eyebrow}：${d.title}${d.relativeLabel ? `（${d.relativeLabel}）` : ''}` : `${eyebrow}: ${d.title}${d.relativeLabel ? ` — ${d.relativeLabel}` : ''}`
  const html = layout({
    locale: d.locale,
    origin: d.origin,
    preheader: [d.relativeLabel, d.whenLabel].filter(Boolean).join(' · ') || d.title,
    eyebrow,
    eyebrowTone: d.overdue ? 'danger' : 'primary',
    title: d.title,
    inner: parent + whenBlock + metaBlock + progressBlock + cpBlock,
    cta: { label: c.open, url: new URL(d.link, d.origin).toString() },
    footnote: c.why,
  })
  const text = [
    `${eyebrow}: ${d.title}`,
    d.parentTitle ?? '',
    d.whenLabel ? `${c.due}: ${d.whenLabel}${d.zoneLabel ? ` (${d.zoneLabel})` : ''}` : '',
    d.relativeLabel ?? '',
    pct != null ? `${c.progress}: ${pct}%` : '',
    ...d.nextCheckpoints.map((cp) => `- ${cp.title}${cp.dateLabel ? ` (${cp.dateLabel})` : ''}`),
    '',
    `${c.open}: ${new URL(d.link, d.origin)}`,
    '',
    c.why,
  ]
    .filter((l, i, arr) => l !== '' || arr[i - 1] !== '')
    .join('\n')
  return { subject, html, text }
}

// ---------------------------------------------------------------------------
// Verification and test
// ---------------------------------------------------------------------------

export function verificationEmail(d: { locale: string; origin: string; code: string; verifyUrl: string; expiresMinutes: number }) {
  const c = copy(d.locale)
  const digits = d.code
    .split('')
    .map((ch) => `<td style="padding:0 3px"><div style="width:42px;height:52px;line-height:52px;text-align:center;border-radius:12px;background:#f6f7fc;border:1px solid ${C.line};font-family:'SF Mono',Menlo,Consolas,monospace;font-size:26px;font-weight:700;color:${C.ink}">${esc(ch)}</div></td>`)
    .join('')
  const inner = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px"><tr>${digits}</tr></table>
<p style="margin:14px 0 0;font-family:${FONT};font-size:13px;color:${C.muted}">${esc(c.verifyExpires(d.expiresMinutes))}</p>`
  const html = layout({
    locale: d.locale,
    origin: d.origin,
    preheader: `${d.code} — ${c.verifyIntro}`,
    eyebrow: 'TickPoint',
    title: c.verifyTitle,
    intro: c.verifyIntro,
    inner,
    cta: { label: c.verifyButton, url: d.verifyUrl },
    footnote: c.whyVerify,
  })
  const text = `${c.verifyTitle}\n\n${c.verifyIntro}\n\n${d.code}\n\n${c.verifyExpires(d.expiresMinutes)}\n${c.verifyButton}: ${d.verifyUrl}\n\n${c.whyVerify}`
  return { subject: `${c.verifySubject}: ${d.code}`, html, text }
}

export function testEmail(d: { locale: string; origin: string }) {
  const c = copy(d.locale)
  const html = layout({
    locale: d.locale,
    origin: d.origin,
    preheader: c.testIntro,
    eyebrow: 'TickPoint',
    title: c.testTitle,
    intro: c.testIntro,
    inner: '',
    cta: { label: c.open, url: new URL('/settings/notifications', d.origin).toString() },
    footnote: c.why,
  })
  return { subject: c.testSubject, html, text: `${c.testTitle}\n\n${c.testIntro}\n\n${c.why}` }
}
