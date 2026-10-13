// Web Crypto helpers. No secrets are ever logged or returned.

const enc = new TextEncoder()
const dec = new TextDecoder()

export function newId(): string {
  // 128-bit random, URL safe, sortable prefix by time for nicer index locality.
  const time = Date.now().toString(36).padStart(9, '0')
  const rand = crypto.getRandomValues(new Uint8Array(10))
  return time + toBase64Url(rand)
}

export function randomToken(bytes = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)))
}

export async function sha256Hex(input: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(input))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const keyCache = new Map<string, Promise<CryptoKey>>()

/** AES-256-GCM key derived via HKDF from a server secret and a purpose label. */
function deriveKey(secret: string, purpose: string): Promise<CryptoKey> {
  const cacheKey = purpose + '\u0000' + secret
  let p = keyCache.get(cacheKey)
  if (!p) {
    p = (async () => {
      const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'HKDF', false, ['deriveKey'])
      return crypto.subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('tickpoint/v1'), info: enc.encode(purpose) },
        base,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
      )
    })()
    keyCache.set(cacheKey, p)
  }
  return p
}

export async function encryptString(plain: string, secret: string, purpose: string): Promise<string> {
  const key = await deriveKey(secret, purpose)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain))
  return toBase64Url(iv) + '.' + toBase64Url(new Uint8Array(ct))
}

export async function decryptString(payload: string, secret: string, purpose: string): Promise<string | null> {
  try {
    const [ivPart, ctPart] = payload.split('.')
    const key = await deriveKey(secret, purpose)
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64Url(ivPart) }, key, fromBase64Url(ctPart))
    return dec.decode(pt)
  } catch {
    return null
  }
}

export function toBase64Url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Decode (without verifying) a JWT payload. Only for reading claims after /api/verify succeeded, or exp pre-checks. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    return JSON.parse(dec.decode(fromBase64Url(parts[1])))
  } catch {
    return null
  }
}

/** Structural check only: three base64url segments, bounded length. */
export function looksLikeJwt(token: unknown): token is string {
  return typeof token === 'string' && token.length < 8192 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}
