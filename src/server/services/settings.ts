import { eq } from 'drizzle-orm'
import { parseJson, schema, type DB } from '../db/client'
import type { SettingsUpdateInput } from '../../shared/schemas'

export type SettingsRow = typeof schema.userSettings.$inferSelect

export async function getSettingsRow(db: DB, owner: string): Promise<SettingsRow> {
  let row = await db.query.userSettings.findFirst({ where: eq(schema.userSettings.userUuid, owner) })
  if (!row) {
    await db.insert(schema.userSettings).values({ userUuid: owner }).onConflictDoNothing()
    row = (await db.query.userSettings.findFirst({ where: eq(schema.userSettings.userUuid, owner) }))!
  }
  return row
}

export function serializeSettings(s: SettingsRow) {
  return {
    locale: s.locale,
    localeExplicit: s.localeExplicit,
    timeZone: s.timeZone,
    dateFormat: s.dateFormat,
    timeFormat: s.timeFormat,
    theme: s.theme,
    weekStart: s.weekStart,
    defaultPriority: s.defaultPriority,
    defaultView: s.defaultView,
    defaultReminderOffsets: parseJson<number[]>(s.defaultReminderOffsets, []),
    defaultEstimateMinutes: s.defaultEstimateMinutes,
    showCompletedCheckpoints: s.showCompletedCheckpoints,
    notifyInApp: s.notifyInApp,
    notifyPush: s.notifyPush,
    notifyEmail: s.notifyEmail,
    quietHoursEnabled: s.quietHoursEnabled,
    quietStart: s.quietStart,
    quietEnd: s.quietEnd,
    aiEnabled: s.aiEnabled,
    aiSaveSourceDefault: s.aiSaveSourceDefault,
    aiAvailableHoursPerDay: s.aiAvailableHoursPerDay,
    aiPlanningStyle: s.aiPlanningStyle,
  }
}

export async function updateSettings(db: DB, owner: string, patch: SettingsUpdateInput) {
  await getSettingsRow(db, owner)
  const set: Partial<SettingsRow> = { updatedAt: Date.now() }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    if (k === 'defaultReminderOffsets') set.defaultReminderOffsets = JSON.stringify(v)
    else (set as Record<string, unknown>)[k] = v
  }
  if (patch.locale) set.localeExplicit = true
  await db.update(schema.userSettings).set(set).where(eq(schema.userSettings.userUuid, owner))
  return serializeSettings(await getSettingsRow(db, owner))
}
