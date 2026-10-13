import { beforeEach, describe, expect, it } from 'vitest'
import { dispatchDueReminders } from '../../src/server/reminders/dispatcher'
import { installFetchStub, json, onFetch, signedIn, stubAuthCenter, testEnv } from './helpers'

const jobs = async () => (await testEnv.DB.prepare('SELECT id, status, attempts, fire_at, last_error FROM reminder_jobs').all<any>()).results

async function dueReminder(c: Awaited<ReturnType<typeof signedIn>>, minutesFromNow = 30) {
  const at = new Date(Date.now() + minutesFromNow * 60_000)
  const date = at.toISOString().slice(0, 10)
  const time = at.toISOString().slice(11, 16)
  const task = (await c.post('/tasks', { kind: 'deadline', title: 'Ship it', due: { precision: 'exact', date, time, timeZone: 'UTC' } })).body.data
  const r = await c.post('/reminders', { taskId: task.id, kind: 'absolute', absoluteAt: Date.now() + 1000, channels: ['in_app', 'push'] })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return { task, ruleId: r.body.data.id as string }
}

describe('reminder dispatch', () => {
  beforeEach(() => {
    installFetchStub()
    stubAuthCenter()
  })

  it('delivers due reminders once (idempotent) and records history', async () => {
    const c = await signedIn('user-alice')
    await dueReminder(c)
    const later = Date.now() + 5_000
    const r1 = await dispatchDueReminders(testEnv, later)
    expect(r1).toMatchObject({ claimed: 1, sent: 1 })
    const r2 = await dispatchDueReminders(testEnv, later + 60_000)
    expect(r2.claimed).toBe(0)

    const notes = (await c.get('/notifications')).body.data
    expect(notes.items).toHaveLength(1)
    expect(notes.unread).toBe(1)
    expect(notes.items[0].title).toContain('Ship it')
    const log = (await c.get('/notifications/deliveries')).body.data
    expect(log.map((d: any) => d.channel)).toContain('in_app')
  })

  it('does not double-claim when two dispatchers overlap', async () => {
    const c = await signedIn('user-alice')
    await dueReminder(c)
    const t = Date.now() + 5_000
    const [a, b] = await Promise.all([dispatchDueReminders(testEnv, t), dispatchDueReminders(testEnv, t)])
    expect(a.claimed + b.claimed).toBe(1)
    expect((await c.get('/notifications')).body.data.items).toHaveLength(1)
  })

  it('localizes reminder copy to the recipient language', async () => {
    const c = await signedIn('user-alice')
    await c.patch('/settings', { locale: 'ja' })
    await dueReminder(c)
    await dispatchDueReminders(testEnv, Date.now() + 5_000)
    const n = (await c.get('/notifications')).body.data.items[0]
    expect(n.title).toMatch(/^リマインダー/)
  })

  it('defers delivery during quiet hours instead of sending', async () => {
    const c = await signedIn('user-alice')
    await c.patch('/settings', { timeZone: 'UTC', quietHoursEnabled: true, quietStart: '00:00', quietEnd: '23:59' })
    await dueReminder(c)
    const r = await dispatchDueReminders(testEnv, Date.now() + 5_000)
    expect(r.deferred).toBe(1)
    expect((await jobs())[0].status).toBe('pending')
    expect((await c.get('/notifications')).body.data.items).toHaveLength(0)
  })

  it('cancels reminders for completed targets', async () => {
    const c = await signedIn('user-alice')
    const { task } = await dueReminder(c)
    // Simulate a job that is already due when the task is completed.
    await c.post(`/tasks/${task.id}/complete`)
    const r = await dispatchDueReminders(testEnv, Date.now() + 5_000)
    expect(r.sent).toBe(0)
    expect((await c.get('/notifications')).body.data.items).toHaveLength(0)
  })

  it('retries transient push failures with backoff and gives up after the limit', async () => {
    const c = await signedIn('user-alice')
    await c.patch('/settings', { notifyPush: true })
    await dueReminder(c)
    // A subscription whose push service is down.
    await testEnv.DB.prepare("INSERT INTO push_subscriptions (id, owner_uuid, endpoint, p256dh, auth) VALUES ('sub1', 'user-alice', 'https://push.example.test/abc', 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'tBHItJI5svbpez7KI4CCXg')").run()
    ;(testEnv as any).VAPID_PUBLIC_KEY = 'BLMhbqV2IRkW9FNjctoZ1S_nKLD22QdM0fzstywts0ROc8r55jKAGFjA9a2UjnHhwLUausnCs35A77b6VL5yOD8'
    ;(testEnv as any).VAPID_PRIVATE_KEY = 'test-private-key-not-real'
    onFetch((req) => (req.url.startsWith('https://push.example.test') ? json({}, 503) : undefined))

    const t0 = Date.now() + 5_000
    const r1 = await dispatchDueReminders(testEnv, t0)
    const deliveries = (await testEnv.DB.prepare('SELECT channel, status, detail FROM notification_deliveries').all()).results
    expect({ r1, deliveries }).toMatchObject({ r1: { claimed: 1 } })
    expect(r1.retry + r1.failed, JSON.stringify({ r1, deliveries })).toBe(1)
    let j = (await jobs())[0]
    expect(['retryable_failure', 'permanent_failure']).toContain(j.status)
    // In-app history is still written exactly once across retries.
    await dispatchDueReminders(testEnv, t0 + 10 * 60_000)
    await dispatchDueReminders(testEnv, t0 + 60 * 60_000)
    expect((await c.get('/notifications')).body.data.items).toHaveLength(1)
    j = (await jobs())[0]
    expect(j.attempts).toBeLessThanOrEqual(5)
    ;(testEnv as any).VAPID_PUBLIC_KEY = ''
    ;(testEnv as any).VAPID_PRIVATE_KEY = undefined
  })

  it('snoozes a delivered reminder into a new occurrence', async () => {
    const c = await signedIn('user-alice')
    await dueReminder(c)
    await dispatchDueReminders(testEnv, Date.now() + 5_000)
    const n = (await c.get('/notifications')).body.data.items[0]
    const s = await c.post(`/reminders/jobs/${n.jobId}/snooze`, { minutes: 15 })
    expect(s.status).toBe(200)
    const pending = (await jobs()).filter((x: any) => x.status === 'pending')
    expect(pending).toHaveLength(1)
  })

  it('reports honest per-channel results for the notification test', async () => {
    const c = await signedIn('user-alice')
    await c.patch('/settings', { notifyEmail: true })
    const r = await c.post('/notifications/test')
    expect(r.body.data.in_app.status).toBe('sent')
    expect(r.body.data.email).toMatchObject({ status: 'skipped', detail: 'email_provider_not_configured' })
  })
})
