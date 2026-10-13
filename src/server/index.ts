// TickPoint Worker entry: Hono API under /api/v1, Vue SPA via Workers Static
// Assets (SPA fallback), and cron-driven reminder dispatch.

import { Hono } from 'hono'
import type { AppBindings, Env } from './env'
import { AppError, fail } from './lib/http'
import { bodyLimit, csrfGuard, requireAuth, securityHeaders } from './middleware'
import { authRoutes } from './api/auth'
import { planningRoutes } from './api/planning'
import { aiRoutes } from './api/ai'
import { notifyRoutes } from './api/notify'
import { overviewRoutes } from './api/overview'
import { dataRoutes } from './api/data'
import { dispatchDueReminders, housekeeping } from './reminders/dispatcher'

export function createApp() {
  const app = new Hono<AppBindings>()

  app.use('/api/*', securityHeaders)
  app.use('/api/*', csrfGuard)
  // Default 1 MB body limit; upload/import routes apply their own larger limits.
  const defaultLimit = bodyLimit(1024 * 1024)
  app.use('/api/*', (c, next) => (/\/(attachments|import)$/.test(c.req.path) ? next() : defaultLimit(c, next)))

  const v1 = new Hono<AppBindings>()
  v1.route('/auth', authRoutes)

  const protectedApi = new Hono<AppBindings>()
  protectedApi.use('*', requireAuth)
  protectedApi.route('/', planningRoutes)
  protectedApi.route('/ai', aiRoutes)
  protectedApi.route('/', notifyRoutes)
  protectedApi.route('/', overviewRoutes)
  protectedApi.route('/', dataRoutes)
  v1.route('/', protectedApi)

  app.route('/api/v1', v1)

  app.notFound((c) => {
    if (c.req.path.startsWith('/api/')) return fail(c, new AppError('NOT_FOUND', 404, 'Endpoint not found'))
    // Defensive SPA fallback (assets normally answer before the Worker runs).
    return c.env.ASSETS.fetch(c.req.raw)
  })

  app.onError((err, c) => {
    if (err instanceof AppError) return fail(c, err)
    // Never echo internals; log a redacted line with the request id.
    console.error(JSON.stringify({ level: 'error', requestId: c.get('requestId'), path: c.req.path, name: (err as Error)?.name, message: String((err as Error)?.message ?? '').slice(0, 300) }))
    return fail(c, new AppError('INTERNAL_ERROR', 500, 'Something went wrong. Please try again.'))
  })

  return app
}

const app = createApp()

export default {
  fetch: app.fetch,
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (controller.cron === '17 3 * * *') {
      ctx.waitUntil(housekeeping(env))
      return
    }
    const report = await dispatchDueReminders(env)
    if (report.claimed > 0) console.log(JSON.stringify({ cron: 'reminders', ...report }))
  },
} satisfies ExportedHandler<Env>
