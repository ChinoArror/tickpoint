export interface Env {
  DB: D1Database
  FILES: R2Bucket
  ASSETS: Fetcher

  APP_ENV: 'production' | 'development' | 'test'
  APP_ORIGIN: string
  AUTH_BASE_URL: string
  AUTH_APP_ID: string
  AUTH_CALLBACK_URL: string
  GEMINI_MODEL: string
  VAPID_PUBLIC_KEY: string
  VAPID_SUBJECT: string
  EMAIL_PROVIDER: 'none' | 'resend' | 'cloudflare'
  EMAIL_FROM: string
  /** Comma-separated origins of the Android app (exact match). Default https://localhost. */
  NATIVE_APP_ORIGINS: string

  // Secrets
  AUTH_APP_SECRET: string
  GEMINI_API_KEY?: string
  VAPID_PRIVATE_KEY?: string
  RESEND_API_KEY?: string
  /** Firebase service-account JSON (project_id, client_email, private_key) for FCM HTTP v1. */
  FCM_SERVICE_ACCOUNT?: string

  /** Cloudflare Email Service send_email binding (when EMAIL_PROVIDER = 'cloudflare'). */
  EMAIL?: {
    send(message: {
      to: string | string[]
      from: string | { email: string; name?: string }
      subject: string
      html?: string
      text?: string
      replyTo?: string | { email: string; name?: string }
      headers?: Record<string, string>
    }): Promise<{ messageId: string }>
  }

  /** Development-only sign-in bypass. Ignored unless APP_ENV is development and host is local. */
  DEV_AUTH_BYPASS?: string
}

export interface AuthIdentity {
  uuid: string
  role: 'admin' | 'user'
  identityType: 'user' | 'test'
  /** Expanded data-scope permissions for test identities; null for regular users. */
  scopePermissions: string[] | null
  sessionHash: string
}

export type AppBindings = {
  Bindings: Env
  Variables: {
    identity: AuthIdentity
    requestId: string
  }
}
