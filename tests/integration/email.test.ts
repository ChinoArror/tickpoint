import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { dispatchDueReminders } from '../../src/server/reminders/dispatcher'
import { Client, installFetchStub, json, makeJwt, onFetch, signedIn, stubAuthCenter, testEnv } from './helpers'

type Sent = { to: string | string[]; from: unknown; subject: string; html?: string; text?: string }
let sent: Sent[] = []
let failWith: string | null = null

function installEmailBinding() {
  sent = []
  failWith = null
  ;(testEnv as any).EMAIL_PROVIDER = 'cloudflare'
  ;(testEnv as any).EMAIL = {
    async send(m: Sent) {
      if (failWith) throw Object.assign(new Error(failWith), { code: failWith })
      sent.push(m)
      return { messageId: `msg-${sent.length}` }
    },
  }
}

const codeFrom = (m: Sent) => m.text!.match(/\b(\d{6})\b/)![1]

describe('email recipients and delivery', () => {
  beforeEach(() => {
    installFetchStub()
    stubAuthCenter()
    installEmailBinding()
  })
  afterEach(() => {
    ;(testEnv as any).EMAIL_PROVIDER = 'none'
    ;(testEnv as any).EMAIL = undefined
  })

  it('treats a verified AuthCenter email as the default recipient and enables email by default', async () => {
    const c = new Client()
    await c.signIn('user-alice', { email_verified: true })
    const list = (await c.get('/notification-emails')).body.data
    // stubAuthCenter returns the email from /api/verify; claims mark it verified.
    expect(list.items).toHaveLength(1)
    expect(list.items[0]).toMatchObject({ source: 'account', verified: true, enabled: true })
    expect((await c.get('/settings')).body.data.notifyEmail).toBe(true)
  })

  it('requires users without an account email to add and verify one; sends from noreply', async () => {
    onFetch((req) => (req.url.includes('/api/verify') ? json({ valid: true, user: { uuid: 'user-bob', name: 'Bob' } }) : undefined))
    const c = new Client()
    await c.post('/auth/session', { token: makeJwt({ sub: 'user-bob' }) })
    expect((await c.get('/notification-emails')).body.data.items).toHaveLength(0)
    expect((await c.get('/settings')).body.data.notifyEmail).toBe(false)

    const add = await c.post('/notification-emails', { address: 'Bob.Personal@Example.test' })
    expect(add.status).toBe(201)
    expect(add.body.data).toMatchObject({ address: 'bob.personal@example.test', verified: false, pendingVerification: true })
    expect(sent).toHaveLength(1)
    expect(sent[0].to).toBe('bob.personal@example.test')
    expect(sent[0].from).toEqual({ email: 'noreply@example.test', name: 'TickPoint' })
    expect(sent[0].html).toContain('TickPoint')

    // Codes are never stored in plain text.
    const row = await testEnv.DB.prepare('SELECT code_hash FROM notification_emails').first<{ code_hash: string }>()
    expect(row!.code_hash).not.toContain(codeFrom(sent[0]))

    const wrong = await c.post(`/notification-emails/${add.body.data.id}/verify`, { code: '000000' === codeFrom(sent[0]) ? '111111' : '000000' })
    expect(wrong.body.error).toMatchObject({ code: 'VERIFICATION_FAILED', details: { reason: 'mismatch', attemptsLeft: 4 } })

    const ok = await c.post(`/notification-emails/${add.body.data.id}/verify`, { code: codeFrom(sent[0]) })
    expect(ok.body.data).toMatchObject({ verified: true, enabled: true })
    // First verified address turns email reminders on.
    expect((await c.get('/settings')).body.data.notifyEmail).toBe(true)
  })

  it('locks verification after too many wrong codes and rate-limits resends', async () => {
    const c = await signedIn('user-bob')
    const id = (await c.post('/notification-emails', { address: 'x@example.test' })).body.data.id
    for (let i = 0; i < 5; i++) await c.post(`/notification-emails/${id}/verify`, { code: '999999' === codeFrom(sent[0]) ? '888888' : '999999' })
    const locked = await c.post(`/notification-emails/${id}/verify`, { code: codeFrom(sent[0]) })
    expect(locked.body.error.details.reason).toBe('attempts')
    const resend = await c.post(`/notification-emails/${id}/resend`)
    expect(resend.body.error.code).toBe('RATE_LIMITED')
  })

  it('sends a branded reminder email to every verified, enabled address', async () => {
    const c = new Client()
    await c.signIn('user-alice', { email_verified: true })
    const extra = (await c.post('/notification-emails', { address: 'alice.work@example.test' })).body.data
    await c.post(`/notification-emails/${extra.id}/verify`, { code: codeFrom(sent[0]) })
    const unverified = (await c.post('/notification-emails', { address: 'nobody@example.test' })).body.data
    expect(unverified.verified).toBe(false)
    sent = []

    const at = new Date(Date.now() + 3 * 3600_000)
    const task = (
      await c.post('/tasks', {
        kind: 'deadline',
        title: 'Thesis draft',
        priority: 'high',
        progressPercent: 40,
        due: { precision: 'exact', date: at.toISOString().slice(0, 10), time: at.toISOString().slice(11, 16), timeZone: 'UTC' },
      })
    ).body.data
    await c.post('/checkpoints', { taskId: task.id, title: 'Outline approved' })
    await c.post('/reminders', { taskId: task.id, kind: 'absolute', absoluteAt: Date.now() + 1000, channels: ['in_app', 'email'] })

    const r = await dispatchDueReminders(testEnv, Date.now() + 5000)
    expect(r.sent).toBe(1)
    expect(sent.map((m) => m.to).sort()).toEqual(['alice.work@example.test', 'user-alice@example.test'])
    const m = sent[0]
    expect(m.subject).toMatch(/^Reminder: Thesis draft — Due in/)
    expect(m.html).toContain('Thesis draft')
    expect(m.html).toContain('Outline approved')
    expect(m.html).toContain('40%')
    expect(m.text).toContain('Open in TickPoint')
    const log = (await c.get('/notifications/deliveries')).body.data.find((d: any) => d.channel === 'email' && d.jobId)
    expect(log).toMatchObject({ status: 'sent', detail: '2/2' })
  })

  it('classifies Email Service errors as retryable or permanent', async () => {
    const c = new Client()
    await c.signIn('user-alice', { email_verified: true })
    const t = (await c.post('/tasks', { title: 'T', due: { precision: 'date', date: '2030-01-01' } })).body.data
    await c.post('/reminders', { taskId: t.id, kind: 'absolute', absoluteAt: Date.now() + 1000, channels: ['email'] })
    failWith = 'E_RATE_LIMIT_EXCEEDED'
    const r = await dispatchDueReminders(testEnv, Date.now() + 5000)
    expect(r.retry).toBe(1)
  })

  it('cannot remove the account address, only disable it', async () => {
    const c = new Client()
    await c.signIn('user-alice', { email_verified: true })
    const acct = (await c.get('/notification-emails')).body.data.items[0]
    expect((await c.del(`/notification-emails/${acct.id}`)).status).toBe(403)
    expect((await c.patch(`/notification-emails/${acct.id}`, { enabled: false })).body.data.enabled).toBe(false)
  })

  it('isolates recipients between users', async () => {
    const alice = new Client()
    await alice.signIn('user-alice', { email_verified: true })
    const bob = await signedIn('user-bob')
    const acct = (await alice.get('/notification-emails')).body.data.items[0]
    expect((await bob.patch(`/notification-emails/${acct.id}`, { enabled: false })).status).toBe(404)
    expect((await bob.get('/notification-emails')).body.data.items.every((x: any) => x.address !== 'user-alice@example.test')).toBe(true)
  })
})

describe('AuthCenter agent quota', () => {
  beforeEach(() => {
    installFetchStub()
    stubAuthCenter()
  })

  it('reports quota status from AuthCenter', async () => {
    onFetch((req) => (req.url.includes('/api/quota/check') ? json({ valid: true, unlimited: false, remaining_tokens: 12000, remaining_requests: 7, quota: { rpd: 10 } }) : undefined))
    const c = await signedIn('user-alice')
    const q = (await c.get('/ai/quota')).body.data
    expect(q).toMatchObject({ status: 'ok', unlimited: false, remainingTokens: 12000, remainingRequests: 7 })
  })

  it('stops AI calls when the usage check fails (fail closed)', async () => {
    onFetch((req) => (req.url.includes('/api/quota/check') ? json({ error: 'bad secret' }, 401) : undefined))
    const c = await signedIn('user-alice')
    const t = (await c.post('/tasks', { title: 'x' })).body.data
    const r = await c.post('/ai/checkpoints', { taskId: t.id })
    expect(r.status).toBe(503)
    expect(r.body.error.code).toBe('QUOTA_CHECK_FAILED')
    expect((await c.get('/ai/quota')).body.data.status).toBe('QUOTA_CHECK_FAILED')
  })

  it('maps 403 to AI_FORBIDDEN', async () => {
    onFetch((req) => (req.url.includes('/api/quota/check') ? json({ error: 'Permission denied' }, 403) : undefined))
    const c = await signedIn('user-alice')
    const t = (await c.post('/tasks', { title: 'x' })).body.data
    expect((await c.post('/ai/checkpoints', { taskId: t.id })).body.error.code).toBe('AI_FORBIDDEN')
  })
})
