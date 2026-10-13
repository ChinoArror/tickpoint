// Google Gemini provider (REST, generateContent) with structured output.
// Never sends credentials other than the API key header to Google.

import type { ZodType, z } from 'zod'
import { AppError } from '../../lib/http'

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const MAX_RESPONSE_CHARS = 250_000

export interface GenerateOptions<S extends ZodType> {
  apiKey: string
  model: string
  system: string
  user: string
  jsonSchema: unknown
  schema: S
  maxOutputTokens?: number
  temperature?: number
  timeoutMs?: number
  maxAttempts?: number
  fetcher?: typeof fetch
}

export interface GenerateResult<T> {
  data: T
  usage: { inputTokens: number; outputTokens: number; totalTokens: number }
  model: string
  attempts: number
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[]
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number; thoughtsTokenCount?: number }
  promptFeedback?: { blockReason?: string }
  modelVersion?: string
}

class RetryableError extends Error {}

/**
 * Gemini's responseJsonSchema rejects some JSON Schema keywords (length/count/range
 * bounds, $schema, additionalProperties). Send only the structural subset; the
 * full Zod schema still validates every response locally.
 */
const UNSUPPORTED_KEYWORDS = new Set(['$schema', 'additionalProperties', 'maxLength', 'minLength', 'maxItems', 'minItems', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'pattern', 'format'])
export function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema)
  if (schema && typeof schema === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(schema)) {
      if (UNSUPPORTED_KEYWORDS.has(k)) continue
      if (k === 'properties' && v && typeof v === 'object') {
        // Keys here are property names (e.g. "format"), not keywords: keep them all.
        out[k] = Object.fromEntries(Object.entries(v).map(([name, sub]) => [name, toGeminiSchema(sub)]))
      } else out[k] = toGeminiSchema(v)
    }
    return out
  }
  return schema
}

export async function generateJson<S extends ZodType>(opts: GenerateOptions<S>): Promise<GenerateResult<z.infer<S>>> {
  const fetcher = opts.fetcher ?? fetch
  const maxAttempts = opts.maxAttempts ?? 2
  let useSchema = true
  const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  let lastError: unknown = null
  let repairHint: string | null = null

  let attempt = 0
  while (attempt < maxAttempts) {
    attempt++
    const body = {
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [{ role: 'user', parts: [{ text: repairHint ? `${opts.user}\n\n${repairHint}` : opts.user }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        ...(useSchema ? { responseJsonSchema: toGeminiSchema(opts.jsonSchema) } : {}),
        temperature: opts.temperature ?? 0.2,
        maxOutputTokens: opts.maxOutputTokens ?? 8192,
      },
    }

    let res: Response
    try {
      res = await fetcher(`${API_BASE}/models/${encodeURIComponent(opts.model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': opts.apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
      })
    } catch (e) {
      lastError = e
      if ((e as Error)?.name === 'TimeoutError' && attempt >= maxAttempts) throw new AppError('AI_TIMEOUT', 504, 'The AI service timed out')
      await backoff(attempt)
      continue
    }

    if (res.status === 400) {
      // Provider error bodies never contain our credentials; log a short excerpt for diagnosis.
      const txt = await res.text()
      console.warn('gemini_400', txt.slice(0, 400))
      if (useSchema) {
        // Some model versions reject parts of a JSON schema; fall back to plain JSON mode + local validation.
        useSchema = false
        attempt-- // the schema fallback does not consume a retry
        continue
      }
      throw new AppError('AI_UNAVAILABLE', 502, `AI request rejected (${res.status})`)
    }
    if (res.status === 429 || res.status >= 500) {
      lastError = new RetryableError(`status ${res.status}`)
      if (attempt >= maxAttempts) break
      await backoff(attempt, res.headers.get('retry-after'))
      continue
    }
    if (res.status === 401 || res.status === 403) throw new AppError('NOT_CONFIGURED', 503, 'AI provider credentials were rejected')
    if (!res.ok) throw new AppError('AI_UNAVAILABLE', 502, `AI request failed (${res.status})`)

    const json = (await res.json()) as GeminiResponse
    const u = json.usageMetadata ?? {}
    usage.inputTokens += u.promptTokenCount ?? 0
    usage.outputTokens += (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0)
    usage.totalTokens += u.totalTokenCount ?? (u.promptTokenCount ?? 0) + (u.candidatesTokenCount ?? 0)

    if (json.promptFeedback?.blockReason) throw new AppError('AI_UNAVAILABLE', 422, 'The AI provider declined to process this content')
    const text = (json.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => !p.thought)
      .map((p) => p.text ?? '')
      .join('')
    if (text.length > MAX_RESPONSE_CHARS) throw new AppError('AI_INVALID_OUTPUT', 502, 'AI output exceeded the size limit')

    const parsed = safeJson(text)
    const checked = parsed === undefined ? null : opts.schema.safeParse(parsed)
    if (checked?.success) {
      return { data: checked.data, usage, model: json.modelVersion ?? opts.model, attempts: attempt }
    }
    // Log only issue locations/codes, never content.
    console.warn('gemini_invalid_output', parsed === undefined ? 'not_json' : JSON.stringify(checked?.error?.issues.slice(0, 8).map((i) => [i.path.join('.'), i.code])), json.candidates?.[0]?.finishReason)
    lastError = new Error('invalid_output')
    repairHint =
      'Your previous answer was not valid JSON for the required schema. Return only a single JSON object that matches the schema exactly, with every required key present.'
    if (attempt >= maxAttempts) break
  }

  if (lastError instanceof RetryableError) throw new AppError('AI_UNAVAILABLE', 503, 'The AI service is busy. Please try again shortly.')
  if ((lastError as Error)?.message === 'invalid_output') throw new AppError('AI_INVALID_OUTPUT', 502, 'The AI returned an invalid result. Please try again.')
  throw new AppError('AI_UNAVAILABLE', 503, 'The AI service is unavailable')
}

function safeJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    return JSON.parse(t)
  } catch {
    return undefined
  }
}

async function backoff(attempt: number, retryAfter?: string | null) {
  const ra = retryAfter ? Number(retryAfter) * 1000 : NaN
  const ms = Number.isFinite(ra) ? Math.min(ra, 4000) : 400 * 2 ** (attempt - 1) + Math.random() * 200
  await new Promise((r) => setTimeout(r, ms))
}
