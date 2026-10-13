// Client-side model for the Smart Capture review screen. Pure functions only:
// build the editable state from an AI extraction, and turn it into the exact
// payload accepted by extractConfirmSchema. Nothing here is saved by itself.

import { extractConfirmSchema, type DueSpec, type ExtractConfirmInput } from '@shared/schemas'
import { REMINDER_PRESETS, REQUIREMENT_TYPES, REWARD_TYPES } from '@shared/constants'
import type { ExtractionResponse, ExtractionResult } from '@/lib/types'

export type RecordKind = 'deadline' | 'task' | 'goal'
export type CreateAs = 'deadline' | 'checkpoint' | 'skip'
export type LocationField = 'physical' | 'building' | 'room' | 'campus' | 'online' | 'contact'
export type RequirementType = (typeof REQUIREMENT_TYPES)[number]
export type RewardType = (typeof REWARD_TYPES)[number]

export interface DeadlineRow {
  key: string
  label: string
  kind: string
  due: DueSpec | null
  createAs: CreateAs
  certainty: 'explicit' | 'inferred'
  confidence: number | null
  evidence: string | null
  evidenceVerified: boolean
  issues: string[]
  removed: boolean
  manual: boolean
}

export interface ListRow {
  key: string
  text: string
  type: string
  evidence: string | null
  evidenceVerified: boolean
  include: boolean
}

export interface AmbiguityRow {
  key: string
  field: string
  description: string
  options: string[]
  evidence: string | null
  reviewed: boolean
}

export interface SuggestionRow {
  key: string
  include: boolean
  title: string
  criteria: string
  targetDate: string
  minutes: number | null
}

export interface LocationEvidence {
  key: string
  kind: string
  text: string
  verified: boolean
}

export interface ReviewState {
  title: string
  category: string
  organization: string
  summary: string
  sourceLanguage: string
  recordKind: RecordKind
  deadlines: DeadlineRow[]
  primaryKey: string | null
  ambiguities: AmbiguityRow[]
  location: Record<LocationField, string>
  locationEvidence: LocationEvidence[]
  submission: {
    method: string
    platform: string
    url: string
    destination: string
    naming: string
    sizeLimit: string
    copies: string
    conditions: string
    fileFormats: string[]
    evidence: string | null
    evidenceVerified: boolean
  }
  deliverables: ListRow[]
  requirements: ListRow[]
  rewards: ListRow[]
  suggestions: SuggestionRow[]
  warnings: string[]
  saveSource: boolean
  reminderKeys: string[]
  projectId: string | null
}

export interface EvidencePassage {
  key: string
  text: string
}

export const LOCATION_FIELDS: LocationField[] = ['physical', 'building', 'room', 'campus', 'online', 'contact']

/** Extraction kinds that usually mean "the thing you hand in", so they default to a separate deadline. */
const SUBMISSION_LIKE = /submi|deliver|final|upload|filing|register|application|due/i

let seq = 0
export function newKey(prefix = 'm') {
  seq += 1
  return `${prefix}${Date.now().toString(36)}${seq}`
}

export function isHttpUrl(u: string): boolean {
  try {
    const p = new URL(u)
    return p.protocol === 'https:' || p.protocol === 'http:'
  } catch {
    return false
  }
}

function toDue(d: ExtractionResult['deadlines'][number]): DueSpec {
  if (d.precision === 'unknown') return { precision: 'unknown' }
  // Never invent a time or zone: missing values stay null until the user chooses.
  if (d.precision === 'exact') return { precision: 'exact', date: d.date, time: d.time, timeZone: d.timezone ?? null }
  return { precision: d.precision, date: d.date, time: null, timeZone: null }
}

function mapLocations(list: ExtractionResult['locations']) {
  const out: Record<LocationField, string> = { physical: '', building: '', room: '', campus: '', online: '', contact: '' }
  const evidence: LocationEvidence[] = []
  const add = (field: LocationField, value: string | null | undefined) => {
    const v = value?.trim()
    if (!v) return
    out[field] = out[field] ? `${out[field]}; ${v}` : v
  }
  for (const loc of list) {
    const k = loc.kind.toLowerCase()
    if (k.includes('online') || k.includes('link') || k === 'url') add('online', [loc.value, loc.url].filter(Boolean).join(' '))
    else if (k.includes('contact')) add('contact', loc.value)
    else if (k.includes('room')) add('room', loc.value)
    else if (k.includes('building')) add('building', loc.value)
    else if (k.includes('campus')) add('campus', loc.value)
    else add('physical', loc.value)
    add('building', loc.building)
    add('room', loc.room)
    add('campus', loc.campus)
    if (loc.evidence) evidence.push({ key: loc.id, kind: loc.kind, text: loc.evidence, verified: loc.evidenceVerified })
  }
  return { fields: out, evidence }
}

/** Build the editable review state from an extraction response. */
export function buildReviewState(res: ExtractionResponse, defaults: { saveSource: boolean; projectId: string | null }): ReviewState {
  const r = res.result
  const deadlines: DeadlineRow[] = r.deadlines.map((d) => ({
    key: d.id,
    label: d.label,
    kind: d.kind,
    due: toDue(d),
    createAs: d.isPrimary ? 'deadline' : SUBMISSION_LIKE.test(d.kind) ? 'deadline' : 'checkpoint',
    certainty: d.certainty,
    confidence: d.confidence,
    evidence: d.evidence,
    evidenceVerified: d.evidenceVerified,
    issues: d.issues,
    removed: false,
    manual: false,
  }))
  const primary = r.deadlines.find((d) => d.isPrimary) ?? r.deadlines[0]
  const loc = mapLocations(r.locations)
  const sub = r.submission
  const toList = (items: { id: string; text: string; evidence: string | null; evidenceVerified: boolean }[], type: (i: number) => string): ListRow[] =>
    items.map((it, i) => ({ key: it.id, text: it.text, type: type(i), evidence: it.evidence, evidenceVerified: it.evidenceVerified, include: true }))
  return {
    title: r.title ?? res.meta.sourceTitle ?? '',
    category: r.category,
    organization: r.organization ?? '',
    summary: r.summary ?? '',
    sourceLanguage: r.sourceLanguage,
    recordKind: primary ? 'deadline' : 'task',
    deadlines,
    primaryKey: primary ? primary.id : null,
    ambiguities: r.ambiguities.map((a) => ({ key: a.id, field: a.field, description: a.description, options: a.options, evidence: a.evidence, reviewed: false })),
    location: loc.fields,
    locationEvidence: loc.evidence,
    submission: {
      method: sub.method ?? '',
      platform: sub.platform ?? '',
      url: sub.url ?? '',
      destination: sub.destination ?? '',
      naming: sub.naming ?? '',
      sizeLimit: sub.sizeLimit ?? '',
      copies: sub.copies ?? '',
      conditions: sub.conditions ?? '',
      fileFormats: [...sub.fileFormats],
      evidence: sub.evidence,
      evidenceVerified: r.submissionEvidenceVerified,
    },
    deliverables: toList(r.deliverables, () => ''),
    requirements: toList(r.requirements, (i) => r.requirements[i].type),
    rewards: toList(r.rewards, (i) => r.rewards[i].type),
    suggestions: r.suggestedCheckpoints.map((s) => ({
      key: newKey('s'),
      include: false,
      title: s.title,
      criteria: s.completionCriteria ?? '',
      targetDate: s.targetDate ?? '',
      minutes: s.estimatedMinutes,
    })),
    warnings: [...r.warnings],
    saveSource: defaults.saveSource,
    reminderKeys: [],
    projectId: defaults.projectId,
  }
}

export function newManualDeadline(): DeadlineRow {
  return { key: newKey('d'), label: '', kind: 'other', due: { precision: 'unknown' }, createAs: 'checkpoint', certainty: 'explicit', confidence: null, evidence: null, evidenceVerified: true, issues: [], removed: false, manual: true }
}

export function newListRow(type = ''): ListRow {
  return { key: newKey('l'), text: '', type, evidence: null, evidenceVerified: true, include: true }
}

/** Keep exactly one main deadline among the rows that are not removed. */
export function ensurePrimary(s: ReviewState) {
  const live = s.deadlines.filter((d) => !d.removed)
  if (!live.some((d) => d.key === s.primaryKey)) s.primaryKey = live[0]?.key ?? null
}

/** Every piece of quoted evidence, keyed so the source panel can focus it. */
export function collectPassages(s: ReviewState): EvidencePassage[] {
  const out: EvidencePassage[] = []
  for (const d of s.deadlines) if (d.evidence && !d.removed) out.push({ key: `dl:${d.key}`, text: d.evidence })
  for (const l of s.locationEvidence) out.push({ key: `loc:${l.key}`, text: l.text })
  if (s.submission.evidence) out.push({ key: 'sub', text: s.submission.evidence })
  for (const r of s.deliverables) if (r.evidence) out.push({ key: `del:${r.key}`, text: r.evidence })
  for (const r of s.requirements) if (r.evidence) out.push({ key: `req:${r.key}`, text: r.evidence })
  for (const r of s.rewards) if (r.evidence) out.push({ key: `rew:${r.key}`, text: r.evidence })
  for (const a of s.ambiguities) if (a.evidence) out.push({ key: `amb:${a.key}`, text: a.evidence })
  return out
}

export function normalizeDue(d: DueSpec | null): DueSpec | null {
  if (!d) return null
  if (d.precision === 'unknown') return { precision: 'unknown' }
  const date = d.date || null
  if (d.precision === 'exact') return { precision: 'exact', date, time: d.time || null, timeZone: d.timeZone || null }
  return { precision: d.precision, date, time: null, timeZone: null }
}

export function countCreated(s: ReviewState) {
  const live = s.deadlines.filter((d) => !d.removed && d.createAs !== 'skip')
  const deadlines = live.filter((d) => d.key === s.primaryKey || d.createAs === 'deadline').length
  const checkpoints = live.filter((d) => d.key !== s.primaryKey && d.createAs === 'checkpoint').length + s.suggestions.filter((x) => x.include).length
  return { deadlines, checkpoints }
}

export type BuildResult = { ok: true; input: ExtractConfirmInput } | { ok: false; issues: { path: (string | number)[]; message: string }[] }

/** Build the confirm payload and validate it with the shared schema. */
export function buildPayload(s: ReviewState, draftId: string): BuildResult {
  const live = s.deadlines.filter((d) => !d.removed)
  const primary = live.find((d) => d.key === s.primaryKey) ?? null
  const extra = live.filter((d) => d.key !== s.primaryKey && d.createAs !== 'skip')

  const loc: Record<string, string> = {}
  for (const f of LOCATION_FIELDS) {
    const v = s.location[f].trim()
    if (v) loc[f] = v
  }
  const sub = s.submission
  const submission: Record<string, unknown> = {}
  for (const [k, v] of [
    ['method', sub.method],
    ['platform', sub.platform],
    ['destination', sub.destination],
    ['naming', sub.naming],
    ['sizeLimit', sub.sizeLimit],
    ['copies', sub.copies],
    ['conditions', sub.conditions],
  ] as const) {
    if (v.trim()) submission[k] = v.trim()
  }
  if (sub.url.trim() && isHttpUrl(sub.url.trim())) submission.url = sub.url.trim()
  if (sub.fileFormats.length) submission.fileFormats = sub.fileFormats
  const hasSubmission = Object.keys(submission).length > 0

  const items = (list: ListRow[]) => list.filter((r) => r.include && r.text.trim()).map((r) => r.text.trim())
  const typed = (list: ListRow[]) => list.filter((r) => r.include && r.text.trim()).map((r) => ({ text: r.text.trim(), type: r.type }))

  const body = {
    draftId,
    saveSource: s.saveSource,
    primary: {
      kind: s.recordKind,
      title: s.title.trim(),
      description: s.summary.trim() || null,
      projectId: s.projectId,
      priority: 'none',
      due: primary ? normalizeDue(primary.due) : null,
      location: Object.keys(loc).length ? loc : null,
      submission: hasSubmission ? submission : null,
      deliverables: items(s.deliverables),
      requirements: typed(s.requirements),
      rewards: typed(s.rewards),
      notes: null,
    },
    additionalDeadlines: extra.map((d) => ({
      label: d.label.trim(),
      due: normalizeDue(d.due) ?? { precision: 'unknown' },
      createAs: d.createAs,
      evidence: d.evidence,
    })),
    checkpoints: s.suggestions
      .filter((x) => x.include)
      .map((x) => ({
        title: x.title.trim(),
        description: null,
        completionCriteria: x.criteria.trim() || null,
        targetDate: x.targetDate || null,
        estimatedMinutes: typeof x.minutes === 'number' && Number.isFinite(x.minutes) ? Math.round(x.minutes) : null,
      })),
    reminderOffsets: REMINDER_PRESETS.filter((p) => s.reminderKeys.includes(p.key)).map((p) => p.minutes),
  }

  const parsed = extractConfirmSchema.safeParse(body)
  if (parsed.success) return { ok: true, input: parsed.data }
  return { ok: false, issues: parsed.error.issues.map((i) => ({ path: i.path as (string | number)[], message: i.message })) }
}
