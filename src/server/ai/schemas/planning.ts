// Structured output contracts for checkpoint planning and analysis.

import { z } from 'zod'
import { PRIORITIES } from '../../../shared/constants'

const nstr = (max: number) => z.string().max(max).nullable()

export const plannedCheckpointSchema = z.object({
  ref: z.string().min(1).max(20),
  title: z.string().min(1).max(300),
  description: nstr(1500),
  completionCriteria: z.string().min(1).max(800),
  startDate: nstr(10),
  targetDate: nstr(10),
  estimatedMinutes: z.number().int().min(0).max(100000).nullable(),
  priority: z.enum(PRIORITIES),
  dependsOn: z.array(z.string().max(20)).max(10),
  reminderOffsetMinutes: z.number().int().min(0).max(43200).nullable(),
  /** True when the step is required by the source; false for optional planning suggestions. */
  fromSourceRequirement: z.boolean(),
  reasoning: z.string().max(600),
})

export const planResultSchema = z.object({
  checkpoints: z.array(plannedCheckpointSchema).min(1).max(20),
  feasibility: z.object({
    feasible: z.boolean(),
    totalEstimatedMinutes: z.number().int().min(0),
    summary: z.string().max(1000),
    conflicts: z.array(z.object({ description: z.string().max(600), refs: z.array(z.string().max(20)).max(20) })).max(10),
  }),
})
export type PlanResult = z.infer<typeof planResultSchema>
export const planJsonSchema = z.toJSONSchema(planResultSchema, { target: 'draft-2020-12' })

export const regenerateResultSchema = z.object({
  checkpoints: z.array(plannedCheckpointSchema).min(1).max(20),
  notes: z.string().max(800),
})
export type RegenerateResult = z.infer<typeof regenerateResultSchema>
export const regenerateJsonSchema = z.toJSONSchema(regenerateResultSchema, { target: 'draft-2020-12' })

export const analysisResultSchema = z.object({
  headline: z.string().max(300),
  narrative: z.string().max(2000),
  suggestions: z.array(z.object({ title: z.string().max(200), detail: z.string().max(800) })).max(6),
  cautions: z.array(z.string().max(400)).max(5),
})
export type AnalysisResult = z.infer<typeof analysisResultSchema>
export const analysisJsonSchema = z.toJSONSchema(analysisResultSchema, { target: 'draft-2020-12' })
