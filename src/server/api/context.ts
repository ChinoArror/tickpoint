import type { Context } from 'hono'
import type { AppBindings } from '../env'
import { getDb } from '../db/client'
import { getSettingsRow } from '../services/settings'
import type { ServiceCtx } from '../services/common'
import type { AiCtx } from '../ai/service'
import type { Locale } from '../../shared/constants'

/** Build the per-request service context. Owner always comes from the verified session. */
export async function svc(c: Context<AppBindings>): Promise<ServiceCtx & { settings: Awaited<ReturnType<typeof getSettingsRow>> }> {
  const db = getDb(c.env.DB)
  const owner = c.get('identity').uuid
  const settings = await getSettingsRow(db, owner)
  return { db, owner, timeZone: settings.timeZone, hoursPerDay: settings.aiAvailableHoursPerDay, now: Date.now(), settings }
}

export async function aiCtx(c: Context<AppBindings>): Promise<AiCtx> {
  const base = await svc(c)
  return {
    ...base,
    env: c.env,
    locale: (base.settings.locale === 'ja' ? 'ja' : 'en') as Locale,
    aiEnabled: base.settings.aiEnabled,
    planningStyle: base.settings.aiPlanningStyle,
    waitUntil: (p) => c.executionCtx.waitUntil(p),
  }
}
