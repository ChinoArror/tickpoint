// Structured output contract for Smart Capture extraction.
// Field names are English and stable; values keep the source language.

import { z } from 'zod'
import { REQUIREMENT_TYPES, REWARD_TYPES } from '../../../shared/constants'

export const EXTRACTION_CATEGORIES = [
  'assignment',
  'exam',
  'competition',
  'event',
  'application',
  'meeting',
  'project',
  'administrative',
  'personal',
  'other',
] as const

export const DEADLINE_KINDS = [
  'registration',
  'submission',
  'draft_submission',
  'final_submission',
  'event_start',
  'event_end',
  'presentation',
  'exam',
  'payment',
  'announcement',
  'other',
] as const

export const LOCATION_KINDS = ['physical', 'online_meeting', 'submission_platform', 'contact'] as const
export const CERTAINTY = ['explicit', 'inferred'] as const
export const AMBIGUITY_KINDS = ['ambiguous', 'conflict', 'missing', 'relative_date', 'timezone_missing'] as const

const nstr = (max: number) => z.string().max(max).nullable()
const evidence = z.string().max(600).nullable()

export const extractionResultSchema = z.object({
  title: nstr(300),
  summary: nstr(1500),
  category: z.enum(EXTRACTION_CATEGORIES),
  organization: nstr(300),
  people: z.array(z.object({ name: z.string().max(200), role: nstr(200), contact: nstr(300) })).max(20),
  sourceLanguage: z.string().max(20),
  deadlines: z
    .array(
      z.object({
        label: z.string().max(300),
        kind: z.enum(DEADLINE_KINDS),
        date: nstr(10),
        time: nstr(5),
        endTime: nstr(5),
        timezone: nstr(64),
        precision: z.enum(['exact', 'date', 'approximate', 'unknown']),
        isPrimary: z.boolean(),
        certainty: z.enum(CERTAINTY),
        confidence: z.number().min(0).max(1),
        evidence,
      }),
    )
    .max(30),
  locations: z
    .array(
      z.object({
        kind: z.enum(LOCATION_KINDS),
        value: z.string().max(500),
        building: nstr(200),
        room: nstr(100),
        campus: nstr(200),
        url: nstr(1000),
        certainty: z.enum(CERTAINTY),
        evidence,
      }),
    )
    .max(20),
  deliverables: z
    .array(z.object({ text: z.string().max(1000), format: nstr(100), quantity: nstr(100), certainty: z.enum(CERTAINTY), evidence }))
    .max(40),
  submission: z.object({
    method: nstr(500),
    platform: nstr(200),
    url: nstr(1000),
    destination: nstr(500),
    fileFormats: z.array(z.string().max(40)).max(20),
    naming: nstr(500),
    sizeLimit: nstr(100),
    copies: nstr(100),
    conditions: nstr(1000),
    evidence,
  }),
  requirements: z
    .array(z.object({ text: z.string().max(1500), type: z.enum(REQUIREMENT_TYPES), certainty: z.enum(CERTAINTY), evidence }))
    .max(60),
  rewards: z.array(z.object({ text: z.string().max(800), type: z.enum(REWARD_TYPES), evidence })).max(30),
  ambiguities: z
    .array(
      z.object({
        kind: z.enum(AMBIGUITY_KINDS),
        field: z.string().max(100),
        description: z.string().max(800),
        options: z.array(z.string().max(300)).max(6),
        evidence,
      }),
    )
    .max(30),
  suggestedTasks: z.array(z.object({ title: z.string().max(300), description: nstr(1000), estimatedMinutes: z.number().int().min(0).max(100000).nullable() })).max(20),
  suggestedCheckpoints: z
    .array(
      z.object({
        title: z.string().max(300),
        completionCriteria: nstr(1000),
        targetDate: nstr(10),
        estimatedMinutes: z.number().int().min(0).max(100000).nullable(),
      }),
    )
    .max(20),
  warnings: z.array(z.string().max(500)).max(10),
})
export type ExtractionResult = z.infer<typeof extractionResultSchema>

/** JSON Schema (draft 2020-12 subset) handed to Gemini as responseJsonSchema. */
export const extractionJsonSchema = z.toJSONSchema(extractionResultSchema, { target: 'draft-2020-12' })
