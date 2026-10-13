// Test harness: drives the Hono app in-process inside the Workers runtime,
// with outbound AuthCenter / Gemini calls replaced by a programmable fetch stub.

import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test'
import { vi } from 'vitest'
import { createApp } from '../../src/server/index'
import type { Env } from '../../src/server/env'

export const testEnv = env as unknown as Env
const app = createApp()
const ORIGIN = 'http://localhost'

type Handler = (req: Request) => Response | Promise<Response> | undefined
const handlers: Handler[] = []
export const outbound: { url: string; method: string; body: string | null; headers: Record<string, string> }[] = []

/** Install a fetch stub; unhandled outbound requests fail loudly. */
export function installFetchStub() {
  handlers.length = 0
  outbound.length = 0
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input as RequestInfo, init)
    const body = init?.body && typeof init.body === 'string' ? init.body : null
    outbound.push({ url: req.url, method: req.method, body, headers: Object.fromEntries(req.headers) })
    for (const h of handlers) {
      const r = await h(req.clone())
      if (r) return r
    }
    return new Response(JSON.stringify({ error: 'unexpected outbound request in test', url: req.url }), { status: 599 })
  })
}

export function onFetch(h: Handler) {
  handlers.unshift(h)
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
}

function b64url(s: string) {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Unsigned JWT-shaped token: TickPoint never verifies locally, AuthCenter (stubbed) does. */
export function makeJwt(claims: Record<string, unknown>) {
  return `${b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, role: 'user', ...claims }))}.sig`
}

/** Accepts tokens whose sub is in `allowed`; mirrors AuthCenter /api/verify. */
export function stubAuthCenter(allowed: Set<string> = new Set(['user-alice', 'user-bob'])) {
  onFetch((req) => {
    const u = new URL(req.url)
    if (u.hostname === 'accounts.example.test' && u.pathname === '/api/verify') {
      const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '')
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
      if (!allowed.has(payload.sub)) return json({ valid: false, error: 'forbidden' }, 403)
      return json({ valid: true, user: { uuid: payload.sub, name: payload.name ?? payload.sub, email: `${payload.sub}@example.test`, role: payload.role } })
    }
    if (u.hostname === 'accounts.example.test' && u.pathname === '/api/quota/check') return json({ valid: true, quota: null, remaining_tokens: null })
    if (u.hostname === 'accounts.example.test') return json({ ok: true })
    return undefined
  })
}

export class Client {
  cookie = ''
  constructor(public name = 'anon') {}

  async req(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}) {
    const headers: Record<string, string> = { Origin: ORIGIN, ...extraHeaders }
    if (this.cookie) headers.Cookie = this.cookie
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const ctx = createExecutionContext()
    const res = await app.request(`${ORIGIN}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' }, testEnv, ctx)
    await waitOnExecutionContext(ctx)
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(';')
      const [k, v] = pair.split('=')
      const jar = new Map(this.cookie ? this.cookie.split('; ').map((p) => p.split('=') as [string, string]) : [])
      if (/max-age=0/i.test(c) || v === '') jar.delete(k)
      else jar.set(k, v)
      this.cookie = [...jar.entries()].map(([a, b]) => `${a}=${b}`).join('; ')
    }
    const text = await res.text()
    let data: any = null
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
    return { status: res.status, body: data, headers: res.headers }
  }

  get = (p: string) => this.req('GET', p)
  post = (p: string, b: unknown = {}) => this.req('POST', p, b)
  patch = (p: string, b: unknown) => this.req('PATCH', p, b)
  del = (p: string, b?: unknown) => this.req('DELETE', p, b)

  /** Full callback flow: POST the AuthCenter JWT and keep the session cookie. */
  async signIn(sub: string, extra: Record<string, unknown> = {}) {
    const r = await this.post('/auth/session', { token: makeJwt({ sub, uuid: sub, name: this.name, ...extra }), timeZone: 'Asia/Tokyo' })
    if (r.status !== 200) throw new Error(`sign-in failed: ${r.status} ${JSON.stringify(r.body)}`)
    return r
  }
}

export async function signedIn(sub: string, name = sub) {
  const c = new Client(name)
  await c.signIn(sub)
  return c
}
