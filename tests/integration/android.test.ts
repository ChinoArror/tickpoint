// Android app: native sign-in hand-off, bearer sessions, CORS/CSRF for the app origin,
// devices (FCM registrations), FCM delivery and Terms acceptance.

import { beforeEach, describe, expect, it } from 'vitest'
import { Client, installFetchStub, json, makeJwt, onFetch, outbound, stubAuthCenter, testEnv } from './helpers'
import { sendNative, notificationRoute } from '../../src/server/notifications/fcm'
import { getDb } from '../../src/server/db/client'
import { TERMS_VERSION } from '../../src/shared/constants'
import type { Env } from '../../src/server/env'

const APP = 'https://localhost'
const b64u = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const rnd = (n = 32) => b64u(crypto.getRandomValues(new Uint8Array(n)))

/** PKCE material for one sign-in attempt. */
async function pkce() {
  const verifier = rnd()
  const challenge = b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
  return { verifier, challenge, state: rnd() }
}

/** Runs the Android sign-in and returns the bearer token. */
async function nativeSession(sub = 'user-alice') {
  const p = await pkce()
  const c = new Client(sub)
  const start = await c.get(`/auth/native/start?state=${p.state}&challenge=${p.challenge}&return=%2Ftasks`)
  expect(start.status).toBe(302)
  const s = await c.post('/auth/session', { token: makeJwt({ sub, uuid: sub, name: sub }), timeZone: 'Asia/Tokyo' })
  expect(s.status, JSON.stringify(s.body)).toBe(200)
  const code = new URL(s.body.data.redirect).searchParams.get('code')!
  const ex = await new Client(sub).post('/auth/native/exchange', { code, verifier: p.verifier, timeZone: 'Asia/Tokyo', locale: 'en' })
  expect(ex.status, JSON.stringify(ex.body)).toBe(200)
  return { token: ex.body.data.token as string, verifier: p.verifier, code, state: p.state }
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })
const installId = () => `inst-${rnd(12)}`
const fcmToken = () => `fcm-${rnd(40)}`

describe('Android sign-in hand-off', () => {
  beforeEach(() => {
    installFetchStub()
    stubAuthCenter()
  })

  it('start sets the tp_native cookie and redirects to AuthCenter', async () => {
    const p = await pkce()
    const c = new Client()
    const r = await c.get(`/auth/native/start?state=${p.state}&challenge=${p.challenge}&return=%2Ftasks`)
    expect(r.status).toBe(302)
    const loc = new URL(r.headers.get('location')!)
    expect(loc.origin + loc.pathname).toBe('https://accounts.example.test/login')
    expect(loc.searchParams.get('redirect')).toBe('http://localhost/sso-callback')
    expect(c.cookie).toMatch(/tp_native=/)
  })

  it('rejects malformed PKCE inputs on start', async () => {
    const r = await new Client().get('/auth/native/start?state=short&challenge=short')
    expect(r.status).toBe(400)
  })

  it('with the tp_native cookie, session sign-in returns the app redirect and creates no web session', async () => {
    const p = await pkce()
    const c = new Client('android')
    await c.get(`/auth/native/start?state=${p.state}&challenge=${p.challenge}&return=%2Ftasks`)
    const r = await c.post('/auth/session', { token: makeJwt({ sub: 'user-alice' }) })
    expect(r.status).toBe(200)
    expect(r.body.data.native).toBe(true)
    const redirect = new URL(r.body.data.redirect)
    expect(redirect.origin + redirect.pathname).toBe('http://localhost/app/auth-complete')
    expect(redirect.searchParams.get('state')).toBe(p.state)
    expect(redirect.searchParams.get('code')).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(c.cookie).not.toMatch(/tp_session=/)
    expect(c.cookie).not.toMatch(/tp_native=/)
    expect(r.headers.getSetCookie().some((x) => x.startsWith('tp_session='))).toBe(false)
    expect((await c.get('/auth/me')).status).toBe(401)
  })

  it('exchange returns a bearer token that works on the API', async () => {
    const s = await nativeSession('user-alice')
    const me = await new Client().req('GET', '/auth/me', undefined, bearer(s.token))
    expect(me.status).toBe(200)
    expect(me.body.data.user.uuid).toBe('user-alice')
    expect(me.body.data.settings.timeZone).toBe('Asia/Tokyo')
  })

  it('rejects replay of the same code', async () => {
    const s = await nativeSession()
    const again = await new Client().post('/auth/native/exchange', { code: s.code, verifier: s.verifier })
    expect(again.status).toBe(400)
    expect(again.body.error.code).toBe('INVALID_GRANT')
    expect(JSON.stringify(again.body)).not.toContain(s.code)
  })

  it('rejects a wrong PKCE verifier', async () => {
    const p = await pkce()
    const c = new Client()
    await c.get(`/auth/native/start?state=${p.state}&challenge=${p.challenge}`)
    const s = await c.post('/auth/session', { token: makeJwt({ sub: 'user-alice' }) })
    const code = new URL(s.body.data.redirect).searchParams.get('code')!
    const r = await new Client().post('/auth/native/exchange', { code, verifier: rnd() })
    expect(r.status).toBe(400)
    expect(r.body.error.code).toBe('INVALID_GRANT')
  })

  it('rejects an expired code', async () => {
    const p = await pkce()
    const c = new Client()
    await c.get(`/auth/native/start?state=${p.state}&challenge=${p.challenge}`)
    const s = await c.post('/auth/session', { token: makeJwt({ sub: 'user-alice' }) })
    const code = new URL(s.body.data.redirect).searchParams.get('code')!
    await testEnv.DB.prepare('UPDATE native_logins SET expires_at = 0').run()
    const r = await new Client().post('/auth/native/exchange', { code, verifier: p.verifier })
    expect(r.status).toBe(400)
    expect(r.body.error.code).toBe('INVALID_GRANT')
  })

  it('a stale tp_native cookie falls back to the normal web sign-in', async () => {
    const c = new Client()
    await c.req('GET', '/auth/login?return=%2Fgoals')
    c.cookie = 'tp_native=' + rnd()
    const r = await c.post('/auth/session', { token: makeJwt({ sub: 'user-alice' }) })
    expect(r.status).toBe(200)
    expect(r.body.data.native).toBeUndefined()
    expect(c.cookie).toMatch(/tp_session=/)
  })
})

describe('Android CORS and CSRF', () => {
  beforeEach(() => {
    installFetchStub()
    stubAuthCenter()
  })

  it('answers the preflight for the app origin without credentials', async () => {
    const r = await new Client().req('OPTIONS', '/tasks', undefined, {
      Origin: APP,
      'Access-Control-Request-Method': 'PATCH',
      'Access-Control-Request-Headers': 'authorization,content-type',
    })
    expect(r.status).toBe(204)
    expect(r.headers.get('access-control-allow-origin')).toBe(APP)
    expect(r.headers.get('vary')).toMatch(/origin/i)
    expect(r.headers.get('access-control-allow-headers')).toMatch(/Authorization/)
    expect(r.headers.get('access-control-allow-methods')).toMatch(/PATCH/)
    expect(r.headers.get('access-control-allow-credentials')).toBeNull()
  })

  it('grants no CORS headers to other origins', async () => {
    const r = await new Client().req('GET', '/auth/config', undefined, { Origin: 'https://evil.example' })
    expect(r.status).toBe(200)
    expect(r.headers.get('access-control-allow-origin')).toBeNull()
    expect(r.headers.get('access-control-allow-credentials')).toBeNull()
  })

  it('error responses for the app origin still carry the CORS headers', async () => {
    const r = await new Client().req('GET', '/auth/me', undefined, { Origin: APP })
    expect(r.status).toBe(401)
    expect(r.body.error.code).toBe('UNAUTHENTICATED')
    expect(r.headers.get('access-control-allow-origin')).toBe(APP)
  })

  it('rejects a cookie-authenticated cross-origin mutation from the app origin', async () => {
    const c = new Client()
    await c.signIn('user-alice')
    const r = await c.req('POST', '/tasks', { title: 'x' }, { Origin: APP })
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('CSRF_REJECTED')
  })

  it('accepts a cross-origin mutation from the app origin with a bearer token', async () => {
    const s = await nativeSession('user-alice')
    const r = await new Client().req('POST', '/tasks', { title: 'From the app' }, { Origin: APP, ...bearer(s.token) })
    expect(r.status).toBeLessThan(300)
  })

  it('still rejects bearer requests from unknown origins', async () => {
    const s = await nativeSession('user-alice')
    const r = await new Client().req('POST', '/tasks', { title: 'x' }, { Origin: 'https://evil.example', ...bearer(s.token) })
    expect(r.status).toBe(403)
  })

  it('bearer logout ends the session and removes its devices', async () => {
    const s = await nativeSession('user-alice')
    const reg = await new Client().req('PUT', '/devices', { installationId: installId(), platform: 'android', fcmToken: fcmToken() }, bearer(s.token))
    expect(reg.status).toBe(200)
    const out = await new Client().req('POST', '/auth/logout', {}, bearer(s.token))
    expect(out.status).toBe(200)
    expect((await new Client().req('GET', '/auth/me', undefined, bearer(s.token))).body.error.code).toBe('UNAUTHENTICATED')
    const left = await testEnv.DB.prepare('SELECT COUNT(*) AS n FROM native_devices').first<{ n: number }>()
    expect(left?.n).toBe(0)
  })

  it('a bearer token cannot be used as a cookie, nor a cookie as a bearer', async () => {
    const s = await nativeSession('user-alice')
    const asCookie = new Client()
    asCookie.cookie = `tp_session=${s.token}`
    expect((await asCookie.get('/auth/me')).status).toBe(401)
    const web = new Client()
    await web.signIn('user-bob')
    const cookieValue = web.cookie.replace('tp_session=', '')
    expect((await new Client().req('GET', '/auth/me', undefined, bearer(cookieValue))).status).toBe(401)
  })
})

describe('Devices API', () => {
  beforeEach(() => {
    installFetchStub()
    stubAuthCenter()
  })

  it('registers, lists without the token, and deletes the caller device', async () => {
    const s = await nativeSession('user-alice')
    const a = new Client()
    const inst = installId()
    const token = fcmToken()
    const put = await a.req('PUT', '/devices', { installationId: inst, platform: 'android', fcmToken: token, appVersion: '1.2.3', locale: 'ja' }, bearer(s.token))
    expect(put.status).toBe(200)
    expect(put.body.data.installationId).toBe(inst)

    const list = await a.req('GET', '/devices', undefined, bearer(s.token))
    expect(list.body.data).toHaveLength(1)
    expect(list.body.data[0]).toMatchObject({ installationId: inst, platform: 'android', appVersion: '1.2.3' })
    expect(JSON.stringify(list.body)).not.toContain(token)

    const del = await a.req('DELETE', `/devices/${inst}`, undefined, bearer(s.token))
    expect(del.body.data).toEqual({ deleted: true })
    expect((await a.req('GET', '/devices', undefined, bearer(s.token))).body.data).toHaveLength(0)
  })

  it('another user cannot delete or see a device, and a token moves to the new owner', async () => {
    const alice = await nativeSession('user-alice')
    const bob = await nativeSession('user-bob')
    const inst = installId()
    const token = fcmToken()
    await new Client().req('PUT', '/devices', { installationId: inst, platform: 'android', fcmToken: token }, bearer(alice.token))

    // Bob deleting Alice's installation id removes nothing of hers.
    await new Client().req('DELETE', `/devices/${inst}`, undefined, bearer(bob.token))
    expect((await new Client().req('GET', '/devices', undefined, bearer(alice.token))).body.data).toHaveLength(1)
    expect((await new Client().req('GET', '/devices', undefined, bearer(bob.token))).body.data).toHaveLength(0)

    // Bob registering the same FCM token (same phone, new account) moves it.
    await new Client().req('PUT', '/devices', { installationId: installId(), platform: 'android', fcmToken: token }, bearer(bob.token))
    expect((await new Client().req('GET', '/devices', undefined, bearer(alice.token))).body.data).toHaveLength(0)
    expect((await new Client().req('GET', '/devices', undefined, bearer(bob.token))).body.data).toHaveLength(1)
  })

  it('moves an installation to the caller when it re-registers under another account', async () => {
    const alice = await nativeSession('user-alice')
    const bob = await nativeSession('user-bob')
    const inst = installId()
    await new Client().req('PUT', '/devices', { installationId: inst, platform: 'android', fcmToken: fcmToken() }, bearer(alice.token))
    await new Client().req('PUT', '/devices', { installationId: inst, platform: 'android', fcmToken: fcmToken() }, bearer(bob.token))
    expect((await new Client().req('GET', '/devices', undefined, bearer(alice.token))).body.data).toHaveLength(0)
    expect((await new Client().req('GET', '/devices', undefined, bearer(bob.token))).body.data).toHaveLength(1)
  })

  it('keeps at most 20 devices per user', async () => {
    const s = await nativeSession('user-alice')
    for (let i = 0; i < 21; i++) {
      const r = await new Client().req('PUT', '/devices', { installationId: installId(), platform: 'android', fcmToken: fcmToken() }, bearer(s.token))
      expect(r.status).toBe(200)
    }
    expect((await new Client().req('GET', '/devices', undefined, bearer(s.token))).body.data).toHaveLength(20)
  })

  it('rejects invalid registrations', async () => {
    const s = await nativeSession('user-alice')
    const r = await new Client().req('PUT', '/devices', { installationId: 'x', platform: 'android', fcmToken: 'short' }, bearer(s.token))
    expect(r.status).toBe(400)
    expect(r.body.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('Terms acceptance', () => {
  beforeEach(() => {
    installFetchStub()
    stubAuthCenter()
  })

  it('rejects a version that is not current and stores the current one', async () => {
    const c = await (async () => {
      const x = new Client()
      await x.signIn('user-alice')
      return x
    })()
    const wrong = await c.req('PUT', '/terms/acceptance', { version: '1999-01-01' })
    expect(wrong.status).toBe(400)
    expect(wrong.body.error.code).toBe('VALIDATION_ERROR')

    const ok = await c.req('PUT', '/terms/acceptance', { version: TERMS_VERSION })
    expect(ok.status).toBe(200)
    const me = await c.get('/auth/me')
    expect(me.body.data.settings.termsVersion).toBe(TERMS_VERSION)
    expect(typeof me.body.data.settings.termsAcceptedAt).toBe('number')
  })
})

describe('FCM delivery', () => {
  let serviceAccount = ''
  const fcmEnv = (on: boolean) => ({ ...testEnv, FCM_SERVICE_ACCOUNT: on ? serviceAccount : undefined }) as unknown as Env

  beforeEach(async () => {
    installFetchStub()
    stubAuthCenter()
    if (!serviceAccount) {
      const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
      const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey))
      const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der)).match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`
      serviceAccount = JSON.stringify({ project_id: 'tickpoint-test', client_email: 'svc@tickpoint-test.iam.gserviceaccount.com', private_key: pem })
    }
    onFetch((req) => (req.url === 'https://oauth2.googleapis.com/token' ? json({ access_token: 'ya29.test-token', expires_in: 3600 }) : undefined))
  })

  const message = (link = '/tasks/t1') => ({ owner: 'user-alice', title: 'Ship it', body: 'Due soon', link, tag: 'tp-rule1' })

  async function registerDevice(sub = 'user-alice') {
    const s = await nativeSession(sub)
    const token = fcmToken()
    await new Client().req('PUT', '/devices', { installationId: installId(), platform: 'android', fcmToken: token }, bearer(s.token))
    return token
  }

  it('is skipped when FCM_SERVICE_ACCOUNT is not configured', async () => {
    await registerDevice()
    const out = await sendNative(fcmEnv(false), getDb(testEnv.DB), message())
    expect(out).toEqual({ status: 'skipped', detail: 'fcm_not_configured' })
    expect(outbound.some((o) => o.url.startsWith('https://fcm.googleapis.com'))).toBe(false)
  })

  it('sends an HTTP v1 message with a same-app route and the reminder channel', async () => {
    const token = await registerDevice()
    onFetch((req) => (req.url.startsWith('https://fcm.googleapis.com/') ? json({ name: 'projects/x/messages/1' }) : undefined))
    const out = await sendNative(fcmEnv(true), getDb(testEnv.DB), message('http://localhost/tasks/t1?x=1'))
    expect(out.status).toBe('sent')
    const send = outbound.find((o) => o.url.startsWith('https://fcm.googleapis.com/v1/projects/tickpoint-test/messages:send'))!
    expect(send.headers.authorization).toBe('Bearer ya29.test-token')
    const body = JSON.parse(send.body!)
    expect(body.message.token).toBe(token)
    expect(body.message.data.route).toBe('/tasks/t1?x=1')
    expect(body.message.android).toMatchObject({ priority: 'HIGH', notification: { channel_id: 'deadlines', tag: 'tp-rule1' } })
    expect(JSON.stringify(outbound)).not.toContain(JSON.parse(serviceAccount).private_key)
  })

  it('deletes a device that FCM reports as UNREGISTERED', async () => {
    await registerDevice()
    onFetch((req) =>
      req.url.startsWith('https://fcm.googleapis.com/')
        ? json({ error: { code: 404, status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }, 404)
        : undefined,
    )
    const out = await sendNative(fcmEnv(true), getDb(testEnv.DB), message())
    expect(out.status).toBe('permanent')
    expect((await testEnv.DB.prepare('SELECT COUNT(*) AS n FROM native_devices').first<{ n: number }>())?.n).toBe(0)
  })

  it('treats a 503 from FCM as retryable and keeps the device', async () => {
    await registerDevice()
    onFetch((req) => (req.url.startsWith('https://fcm.googleapis.com/') ? json({ error: { status: 'UNAVAILABLE' } }, 503) : undefined))
    const out = await sendNative(fcmEnv(true), getDb(testEnv.DB), message())
    expect(out.status).toBe('retryable')
    const row = await testEnv.DB.prepare('SELECT failure_count AS f FROM native_devices').first<{ f: number }>()
    expect(row?.f).toBe(1)
  })

  it('only keeps same-app routes', () => {
    expect(notificationRoute('https://evil.example/tasks/1', 'https://point.aryuki.com')).toBe('/')
    expect(notificationRoute('//evil.example/x', 'https://point.aryuki.com')).toBe('/')
    expect(notificationRoute('https://point.aryuki.com/goals/g1', 'https://point.aryuki.com')).toBe('/goals/g1')
    expect(notificationRoute('/api/v1/auth/me', 'https://point.aryuki.com')).toBe('/')
  })
})
