import { beforeEach, describe, expect, it } from 'vitest'
import { Client, installFetchStub, json, makeJwt, onFetch, outbound, stubAuthCenter, testEnv } from './helpers'

describe('AuthCenter sign-in and sessions', () => {
  beforeEach(() => {
    installFetchStub()
    stubAuthCenter()
  })

  it('verifies the callback token with AuthCenter and creates a session', async () => {
    const c = new Client('Alice')
    const r = await c.post('/auth/session', { token: makeJwt({ sub: 'user-alice', name: 'Alice' }) })
    expect(r.status).toBe(200)
    expect(c.cookie).toMatch(/tp_session=/)
    const verify = outbound.find((o) => o.url.includes('/api/verify'))
    expect(verify?.url).toContain('app_id=tickpoint')
    expect(verify?.headers.authorization).toMatch(/^Bearer /)

    const me = await c.get('/auth/me')
    expect(me.status).toBe(200)
    expect(me.body.data.user.uuid).toBe('user-alice')
    expect(me.body.data.profileUrl).toBe('https://accounts.example.test/user/user-alice')
  })

  it('never exposes the JWT or secrets in responses', async () => {
    const c = new Client()
    const token = makeJwt({ sub: 'user-alice' })
    const r = await c.post('/auth/session', { token })
    expect(JSON.stringify(r.body)).not.toContain(token)
    const me = await c.get('/auth/me')
    expect(JSON.stringify(me.body)).not.toContain(token)
    expect(JSON.stringify(me.body)).not.toContain(testEnv.AUTH_APP_SECRET)
  })

  it('rejects malformed tokens without calling AuthCenter', async () => {
    const r = await new Client().post('/auth/session', { token: 'not-a-jwt' })
    expect(r.status).toBe(401)
    expect(r.body.error.code).toBe('AUTH_REJECTED')
    expect(outbound.some((o) => o.url.includes('/api/verify'))).toBe(false)
  })

  it('rejects expired tokens locally', async () => {
    const r = await new Client().post('/auth/session', { token: makeJwt({ sub: 'user-alice', exp: Math.floor(Date.now() / 1000) - 10 }) })
    expect(r.status).toBe(401)
    expect(r.body.error.details.reason).toBe('expired')
    expect(outbound.some((o) => o.url.includes('/api/verify'))).toBe(false)
  })

  it('rejects users without app permission (verify returns 403)', async () => {
    const r = await new Client().post('/auth/session', { token: makeJwt({ sub: 'user-mallory' }) })
    expect(r.status).toBe(401)
    expect(r.body.error.code).toBe('AUTH_REJECTED')
  })

  it('rejects a verify response whose uuid does not match the token subject', async () => {
    onFetch((req) => (req.url.includes('/api/verify') ? json({ valid: true, user: { uuid: 'someone-else' } }) : undefined))
    const r = await new Client().post('/auth/session', { token: makeJwt({ sub: 'user-alice' }) })
    expect(r.status).toBe(401)
  })

  it('returns 503 when AuthCenter is unreachable', async () => {
    onFetch((req) => (req.url.includes('/api/verify') ? json({}, 502) : undefined))
    const r = await new Client().post('/auth/session', { token: makeJwt({ sub: 'user-alice' }) })
    expect(r.status).toBe(503)
    expect(r.body.error.code).toBe('AUTH_UNAVAILABLE')
  })

  it('blocks test identities that are not allowed for this app', async () => {
    const r = await new Client().post('/auth/session', {
      token: makeJwt({ sub: 'user-alice', identity_type: 'test', test_session: true, allowed_subapps: ['other-app'], data_scope: 'private_write' }),
    })
    expect(r.status).toBe(403)
  })

  it('enforces test identity data scopes on writes', async () => {
    const c = new Client()
    await c.signIn('user-bob', { identity_type: 'test', test_session: true, allowed_subapps: ['tickpoint'], data_scope: 'private_read', data_scope_permissions: ['public_read', 'private_read'] })
    expect((await c.get('/tasks')).status).toBe(200)
    const w = await c.post('/tasks', { title: 'x' })
    expect(w.status).toBe(403)
  })

  it('treats a revoked central session as expired (silent renewal signal)', async () => {
    const c = await (async () => {
      const x = new Client()
      await x.signIn('user-alice')
      return x
    })()
    // Force re-verification and make AuthCenter reject the token (revoked device).
    await testEnv.DB.prepare('UPDATE sessions SET last_verified_at = 0').run()
    onFetch((req) => (req.url.includes('/api/verify') ? json({ valid: false }, 401) : undefined))
    const me = await c.get('/auth/me')
    expect(me.status).toBe(401)
    expect(me.body.error.code).toBe('SESSION_EXPIRED')
    // The local session row is gone; the next request is plainly unauthenticated.
    expect((await c.get('/auth/me')).body.error.code).toBe('UNAUTHENTICATED')
  })

  it('expires sessions when the JWT lifetime ends even if the cookie remains', async () => {
    const c = new Client()
    await c.signIn('user-alice')
    await testEnv.DB.prepare('UPDATE sessions SET jwt_exp = ?').bind(Date.now() - 1000).run()
    const me = await c.get('/auth/me')
    expect(me.body.error.code).toBe('SESSION_EXPIRED')
  })

  it('local logout ends only the TickPoint session', async () => {
    const c = new Client()
    await c.signIn('user-alice')
    const out = await c.post('/auth/logout')
    expect(out.status).toBe(200)
    expect((await c.get('/auth/me')).status).toBe(401)
    // No call to AuthCenter logout from the server.
    expect(outbound.some((o) => o.url.includes('/logout'))).toBe(false)
  })

  it('login redirect targets the documented AuthCenter endpoint and stops redirect loops', async () => {
    const c = new Client()
    const r = await c.req('GET', '/auth/login?return=%2Fgoals')
    expect(r.status).toBe(302)
    const loc = new URL(r.headers.get('location')!)
    expect(loc.origin + loc.pathname).toBe('https://accounts.example.test/login')
    expect(loc.searchParams.get('app_id')).toBe('tickpoint')
    expect(loc.searchParams.get('redirect')).toBe('http://localhost/sso-callback')
    await c.req('GET', '/auth/login')
    await c.req('GET', '/auth/login')
    const loop = await c.req('GET', '/auth/login')
    expect(loop.headers.get('location')).toBe('/signin?error=loop')
  })

  it('restores the intended destination after sign-in and rejects open redirects', async () => {
    const c = new Client()
    await c.req('GET', '/auth/login?return=%2Fgoals%3Fx%3D1')
    const ok = await c.post('/auth/session', { token: makeJwt({ sub: 'user-alice' }) })
    expect(ok.body.data.redirect).toBe('/goals?x=1')

    const d = new Client()
    await d.req('GET', '/auth/login?return=https%3A%2F%2Fevil.example')
    const r = await d.post('/auth/session', { token: makeJwt({ sub: 'user-alice' }) })
    expect(r.body.data.redirect).toBe('/')
  })

  it('rejects unauthenticated API access', async () => {
    const r = await new Client().get('/tasks')
    expect(r.status).toBe(401)
    expect(r.body.error.code).toBe('UNAUTHENTICATED')
  })

  it('rejects cross-site mutations (CSRF)', async () => {
    const c = new Client()
    await c.signIn('user-alice')
    const r = await c.req('POST', '/tasks', { title: 'x' }, { Origin: 'https://evil.example' })
    expect(r.status).toBe(403)
    expect(r.body.error.code).toBe('CSRF_REJECTED')
  })

  it('disables the development sign-in outside development', async () => {
    const r = await new Client().post('/auth/dev-login', { user: 'alice' })
    expect(r.status).toBe(404)
  })
})
