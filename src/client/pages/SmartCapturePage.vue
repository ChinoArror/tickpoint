<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { refDebounced } from '@vueuse/core'
import { AlertTriangle, Check, ChevronDown, FileText, Info, Sparkles, Trash2 } from 'lucide-vue-next'
import AiLanguagePicker from '@/components/ai/AiLanguagePicker.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Field from '@/components/ui/Field.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Segmented from '@/components/ui/Segmented.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Spinner from '@/components/ui/Spinner.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Card from '@/components/ui/Card.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import ReviewForm from '@/components/capture/ReviewForm.vue'
import SourceHighlighter, { type Passage } from '@/components/capture/SourceHighlighter.vue'
import {
  buildPayload,
  buildReviewState,
  collectPassages,
  countCreated,
  isHttpUrl,
  type ReviewState,
} from '@/components/capture/reviewModel'
import { api } from '@/lib/api'
import type { ExtractionResponse, PlanDraft } from '@/lib/types'
import { LIMITS } from '@shared/constants'
import { useErrorMessage, invalidatePlanning, useProjects } from '@/composables/useTasks'
import { useFormat } from '@/composables/useFormat'
import { useAiLanguage } from '@/composables/useAiLanguage'
import { confirm as askConfirm } from '@/composables/useConfirm'
import { useToast } from '@/composables/useToast'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'

/** Smart Capture: paste -> analyze -> review -> confirm -> next steps. */
type DraftInfo = ExtractionResponse & { primaryTaskId?: string | null; primaryGoalId?: string | null }

const props = defineProps<{ draftId?: string }>()
const { t } = useI18n()
const router = useRouter()
const qc = useQueryClient()
const session = useSessionStore()
const ui = useUiStore()
const f = useFormat()
const toast = useToast()
const errMsg = useErrorMessage()
const projectsQ = useProjects()

const aiOff = computed(() => session.settings?.aiEnabled === false)
const projectOptions = computed<{ value: string | null; label: string }[]>(() => [
  { value: null, label: t('capture.input.noProject') },
  ...(projectsQ.data.value ?? []).filter((p) => p.status === 'active').map((p) => ({ value: p.id, label: p.name })),
])

// ---------------------------------------------------------------- step 1: input
const text = ref('')
const sourceTitle = ref('')
const sourceUrl = ref('')
const sourceDate = ref('')
const context = ref('')
const projectId = ref<string | null>(null)
const showDetails = ref(false)
const outputLanguage = useAiLanguage()

if (!props.draftId) {
  try {
    const stored = sessionStorage.getItem('tp.captureDraft')
    if (stored) {
      text.value = stored
      sessionStorage.removeItem('tp.captureDraft')
    }
  } catch {
    /* storage unavailable */
  }
}

const max = LIMITS.captureMaxChars
const min = LIMITS.captureMinChars
const debouncedLen = refDebounced(computed(() => text.value.length), 150)
const trimmedLen = computed(() => text.value.trim().length)
const ratio = computed(() => debouncedLen.value / max)
const tooShort = computed(() => trimmedLen.value > 0 && trimmedLen.value < min)
const tooLong = computed(() => trimmedLen.value > max)
const urlInvalid = computed(() => !!sourceUrl.value.trim() && !isHttpUrl(sourceUrl.value.trim()))
const counterClass = computed(() => (tooLong.value ? 'text-danger-text' : ratio.value > 0.9 ? 'text-warning-text' : 'text-muted'))
const canAnalyze = computed(() => trimmedLen.value >= min && !tooLong.value && !urlInvalid.value && !analyzing.value)

// ---------------------------------------------------------------- step 2: analyzing
const analyzing = ref(false)
const analyzeError = ref<string | null>(null)
const sourceText = ref('')
const sourcePreview = computed(() => sourceText.value.slice(0, 6000))
const msgIndex = ref(0)
let msgTimer: ReturnType<typeof setInterval> | null = null
let attempt = 0
const response = ref<DraftInfo | null>(null)

function stopAnalyzing() {
  if (msgTimer) clearInterval(msgTimer)
  msgTimer = null
  analyzing.value = false
}

async function analyze() {
  if (!canAnalyze.value) return
  const id = ++attempt
  sourceText.value = text.value.trim()
  analyzeError.value = null
  analyzing.value = true
  msgIndex.value = 0
  msgTimer = setInterval(() => {
    msgIndex.value = (msgIndex.value + 1) % 4
  }, 1600)
  try {
    const res = await api.post<ExtractionResponse>('/ai/extract', {
      text: sourceText.value,
      sourceTitle: sourceTitle.value.trim() || null,
      sourceUrl: sourceUrl.value.trim() || null,
      sourceDate: sourceDate.value || null,
      context: context.value.trim() || null,
      projectId: projectId.value,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      outputLanguage: outputLanguage.value,
    })
    if (id !== attempt) return
    stopAnalyzing()
    response.value = { ...res, sourceText: sourceText.value }
    await router.replace(`/capture/${res.draftId}`)
  } catch (e) {
    if (id !== attempt) return
    stopAnalyzing()
    analyzeError.value = errMsg(e)
  }
}

/** Ignore the in-flight result; the text stays in the form. */
function cancelAnalyzing() {
  attempt++
  stopAnalyzing()
}

onBeforeUnmount(() => {
  attempt++
  stopAnalyzing()
})

// ---------------------------------------------------------------- step 3: review
const draftQ = useQuery({
  queryKey: computed(() => ['ai', 'extract', props.draftId ?? '']),
  queryFn: ({ signal }) => api.get<DraftInfo>(`/ai/extract/${props.draftId}`, undefined, signal),
  enabled: computed(() => !!props.draftId && response.value?.draftId !== props.draftId),
  retry: false,
})

const draft = computed<DraftInfo | null>(() => {
  if (props.draftId && response.value?.draftId === props.draftId) return response.value
  return draftQ.data.value ?? null
})
const reviewStatus = computed(() => draft.value?.status ?? 'pending')
const isPending = computed(() => reviewStatus.value === 'pending')
const sourceFull = computed(() => draft.value?.sourceText ?? '')

const review = ref<ReviewState | null>(null)
let reviewFor: string | null = null
watch(
  draft,
  (d) => {
    if (!d || d.draftId === reviewFor) return
    reviewFor = d.draftId
    review.value = buildReviewState(d, { saveSource: session.settings?.aiSaveSourceDefault ?? true, projectId: d.meta.projectId ?? null })
  },
  { immediate: true },
)

// Passages only change when the evidence changes, so highlighting does not re-run on every keystroke.
const passageSignature = computed(() => (review.value ? collectPassages(review.value).map((p) => `${p.key}\u0001${p.text}`).join('\u0002') : ''))
const passages = ref<Passage[]>([])
watch(
  passageSignature,
  () => {
    passages.value = review.value ? collectPassages(review.value) : []
  },
  { immediate: true },
)

const mobileTab = ref<'extracted' | 'source'>('extracted')
const tabOptions = computed(() => [
  { value: 'extracted' as const, label: t('capture.review.tabs.extracted') },
  { value: 'source' as const, label: t('capture.review.tabs.source') },
])
const focusKey = ref<string | null>(null)

function focusEvidence(key: string) {
  mobileTab.value = 'source'
  focusKey.value = null
  nextTick(() => {
    focusKey.value = key
  })
}

const remainingReview = computed(() => review.value?.ambiguities.filter((a) => !a.reviewed).length ?? 0)
const busy = ref(false)
const issues = ref<string[]>([])

function issueText(path: (string | number)[]) {
  const p = path.map(String)
  if (p.includes('timeZone')) return t('capture.review.validation.timeZone')
  if (p[0] === 'primary' && p[1] === 'title') return t('capture.review.validation.title')
  return t('capture.review.validation.generic')
}

async function confirmDraft() {
  const d = draft.value
  const s = review.value
  if (!d || !s || busy.value) return
  const built = buildPayload(s, d.draftId)
  if (!built.ok) {
    issues.value = [...new Set(built.issues.map((i) => issueText(i.path)))]
    return
  }
  issues.value = []
  busy.value = true
  try {
    const r = await api.post<{ primaryTaskId: string | null; primaryGoalId: string | null; sourceId: string | null }>(`/ai/extract/${d.draftId}/confirm`, built.input)
    const counts = countCreated(s)
    invalidatePlanning(qc)
    doneInfo.value = {
      primaryTaskId: r.primaryTaskId ?? null,
      primaryGoalId: r.primaryGoalId ?? null,
      deadlines: counts.deadlines,
      checkpoints: counts.checkpoints,
      sourceSaved: built.input.saveSource && !!r.sourceId,
    }
  } catch (e) {
    toast.error(errMsg(e))
  } finally {
    busy.value = false
  }
}

async function rejectDraft() {
  const d = draft.value
  if (!d || busy.value) return
  const ok = await askConfirm({
    title: t('capture.review.footer.rejectTitle'),
    message: t('capture.review.footer.rejectMessage'),
    confirmLabel: t('capture.review.footer.rejectConfirm'),
    danger: true,
  })
  if (!ok) return
  busy.value = true
  try {
    await api.post(`/ai/extract/${d.draftId}/reject`)
    toast.info(t('capture.review.footer.rejected'))
    await startOver(true)
  } catch (e) {
    toast.error(errMsg(e))
  } finally {
    busy.value = false
  }
}

/** Return to step 1, optionally keeping the source text for another try. */
async function startOver(keepText: boolean) {
  const kept = sourceText.value || sourceFull.value
  response.value = null
  review.value = null
  reviewFor = null
  doneInfo.value = null
  issues.value = []
  focusKey.value = null
  if (keepText) text.value = kept
  await router.replace('/capture')
}

function openDraftItem() {
  const d = draft.value
  if (d?.primaryTaskId) ui.openTask(d.primaryTaskId)
  else if (d?.primaryGoalId) router.push(`/goals/${d.primaryGoalId}`)
}

// ---------------------------------------------------------------- step 5: done
interface DoneInfo {
  primaryTaskId: string | null
  primaryGoalId: string | null
  deadlines: number
  checkpoints: number
  sourceSaved: boolean
}
const doneInfo = ref<DoneInfo | null>(null)
const planBusy = ref(false)

async function generatePlan() {
  const d = doneInfo.value
  if (!d || planBusy.value) return
  planBusy.value = true
  try {
    const body = { ...(d.primaryTaskId ? { taskId: d.primaryTaskId } : { goalId: d.primaryGoalId }), outputLanguage: outputLanguage.value }
    const plan = await api.post<PlanDraft>('/ai/checkpoints', body)
    await router.push(`/plan/${plan.draftId}`)
  } catch (e) {
    toast.error(errMsg(e))
  } finally {
    planBusy.value = false
  }
}

async function captureAnother() {
  text.value = ''
  sourceTitle.value = ''
  sourceUrl.value = ''
  sourceDate.value = ''
  context.value = ''
  sourceText.value = ''
  await startOver(false)
}

// ---------------------------------------------------------------- layout helpers
const phase = computed<'input' | 'analyzing' | 'review' | 'done'>(() => {
  if (doneInfo.value) return 'done'
  if (props.draftId) return 'review'
  if (analyzing.value) return 'analyzing'
  return 'input'
})
const currentStep = computed(() => ({ input: 1, analyzing: 2, review: busy.value ? 4 : 3, done: 5 })[phase.value])
const steps = computed(() => ['paste', 'analyze', 'review', 'confirm', 'next'].map((k, i) => ({ key: k, n: i + 1, label: t(`capture.steps.${k}`) })))
const currentStepLabel = computed(() => steps.value[currentStep.value - 1]?.label ?? '')
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8" :class="phase === 'review' && isPending ? 'max-md:pb-44' : ''">
    <header class="flex flex-col gap-4">
      <h1 class="text-2xl font-semibold tracking-tight text-fg md:text-[28px]">{{ t('capture.title') }}</h1>
      <!-- Compact step header on phones; the full stepper takes over from 640px. -->
      <div class="flex flex-col gap-2 sm:hidden">
        <p class="text-xs font-medium text-muted">{{ t('capture.stepCompact', { n: currentStep, total: steps.length, label: currentStepLabel }) }}</p>
        <ProgressBar :value="currentStep" :max="steps.length" size="xs" tone="primary" :label="t('capture.progress')" />
      </div>
      <ol class="-m-1 hidden flex-wrap items-center gap-1.5 p-1 text-xs sm:flex" :aria-label="t('capture.progress')">
        <li v-for="s in steps" :key="s.key" class="flex shrink-0 items-center gap-1.5" :aria-current="currentStep === s.n ? 'step' : undefined">
          <span
            class="tabular grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold"
            :class="currentStep > s.n ? 'bg-primary text-on-primary' : currentStep === s.n ? 'bg-primary-soft text-primary-text ring-2 ring-primary/30' : 'bg-surface-sunken text-subtle'"
          >
            <Check v-if="currentStep > s.n" class="size-3" aria-hidden="true" />
            <template v-else>{{ s.n }}</template>
          </span>
          <span class="whitespace-nowrap" :class="currentStep === s.n ? 'font-semibold text-fg' : 'text-muted'">{{ s.label }}</span>
          <span v-if="s.n < 5" class="mx-1 h-px w-6 bg-border sm:w-10" aria-hidden="true" />
        </li>
      </ol>
    </header>

    <div class="mt-6">
      <!-- Step 5: next steps -->
      <section v-if="phase === 'done' && doneInfo" class="mx-auto flex max-w-xl animate-fade-up flex-col items-center gap-4 py-8 text-center" aria-live="polite">
        <div class="animate-scale-in grid size-16 place-items-center rounded-full bg-success-soft text-success-text">
          <svg class="size-9" viewBox="0 0 48 48" aria-hidden="true">
            <circle class="done-ring" cx="24" cy="24" r="22" fill="none" stroke="currentColor" stroke-width="2.5" />
            <path class="done-tick" d="M14 25l7 7 13-14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
        <h2 class="text-xl font-semibold tracking-tight text-fg">{{ t('capture.done.title') }}</h2>
        <p class="text-sm text-muted">{{ t('capture.done.summary', { deadlines: doneInfo.deadlines, checkpoints: doneInfo.checkpoints }) }}</p>
        <p class="flex items-center gap-1.5 text-xs text-muted">
          <FileText class="size-3.5" aria-hidden="true" />{{ doneInfo.sourceSaved ? t('capture.done.sourceSaved') : t('capture.done.sourceNotSaved') }}
        </p>
        <div class="mt-2 flex flex-wrap justify-center gap-2">
          <Button variant="secondary" :disabled="!doneInfo.primaryTaskId && !doneInfo.primaryGoalId" @click="openDraftItem">{{ t('capture.done.open') }}</Button>
          <Button variant="ai" :loading="planBusy" :disabled="!doneInfo.primaryTaskId && !doneInfo.primaryGoalId" @click="generatePlan"><Sparkles aria-hidden="true" />{{ t('capture.done.generate') }}</Button>
          <Button variant="ghost" @click="captureAnother">{{ t('capture.done.another') }}</Button>
        </div>
        <p class="text-xs text-subtle">{{ t('capture.done.generateHint') }}</p>
      </section>

      <!-- Step 1: paste -->
      <div v-else-if="phase === 'input'" class="mx-auto max-w-3xl animate-fade-up">
        <EmptyState
          v-if="aiOff"
          :icon="Sparkles"
          :title="t('capture.input.aiOffTitle')"
          :description="t('capture.input.aiOffDescription')"
        >
          <Button variant="secondary" @click="router.push('/settings/ai')">{{ t('capture.input.aiOffAction') }}</Button>
        </EmptyState>

        <template v-else>
          <div class="flex flex-col gap-1">
            <h2 class="text-[15px] font-semibold text-fg">{{ t('capture.input.heading') }}</h2>
            <p class="text-sm text-muted">{{ t('capture.input.lead') }}</p>
          </div>

          <Field v-slot="{ id, describedby, invalid }" :label="t('capture.input.label')" class="mt-4">
            <Textarea
              :id="id"
              v-model="text"
              :aria-describedby="describedby"
              :invalid="invalid || tooLong"
              class="min-h-[280px] text-[14px] leading-relaxed"
              :placeholder="t('capture.input.placeholder')"
              spellcheck="false"
            />
          </Field>

          <div class="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
            <p class="tabular" :class="counterClass" aria-live="polite">
              {{ t('capture.input.counter', { count: f.number(debouncedLen, 0), max: f.number(max, 0) }) }}
              <span class="text-subtle">· {{ t('capture.input.tokens', { n: f.number(Math.ceil(debouncedLen / 4), 0) }) }}</span>
            </p>
            <p v-if="tooShort" class="text-warning-text">{{ t('capture.input.tooShort', { min }) }}</p>
            <p v-if="tooLong" class="text-danger-text">{{ t('capture.input.tooLong', { max: f.number(max, 0) }) }}</p>
          </div>

          <div class="mt-5">
            <button
              type="button"
              class="flex items-center gap-1.5 rounded-md text-[13px] font-medium text-muted hover:text-fg"
              aria-controls="capture-details"
              :aria-expanded="showDetails"
              @click="showDetails = !showDetails"
            >
              <ChevronDown class="size-4 transition-transform duration-200" :class="showDetails ? 'rotate-180' : ''" aria-hidden="true" />
              {{ t('capture.input.details') }}
            </button>
            <Transition name="fade">
              <div v-if="showDetails" id="capture-details" class="mt-3 grid gap-3.5 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-2">
                <Field v-slot="{ id, describedby }" :label="t('capture.input.sourceTitle')" class="sm:col-span-2">
                  <Input :id="id" v-model="sourceTitle" :aria-describedby="describedby" />
                </Field>
                <Field v-slot="{ id, describedby }" :label="t('capture.input.sourceUrl')" :hint="t('capture.input.sourceUrlHint')" :error="urlInvalid ? t('capture.input.invalidUrl') : null" class="sm:col-span-2">
                  <Input :id="id" v-model="sourceUrl" type="url" inputmode="url" :aria-describedby="describedby" :invalid="urlInvalid" />
                </Field>
                <Field v-slot="{ id, describedby }" :label="t('capture.input.sourceDate')" :hint="t('capture.input.sourceDateHint')">
                  <Input :id="id" v-model="sourceDate" type="date" :aria-describedby="describedby" />
                </Field>
                <Field v-slot="{ id, describedby }" :label="t('capture.input.project')">
                  <Select :id="id" v-model="projectId" :options="projectOptions" :aria-describedby="describedby" />
                </Field>
                <Field v-slot="{ id, describedby }" :label="t('capture.input.context')" :hint="t('capture.input.contextHint')" class="sm:col-span-2">
                  <Textarea :id="id" v-model="context" rows="2" :aria-describedby="describedby" />
                </Field>
              </div>
            </Transition>
          </div>

          <div v-if="analyzeError" class="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5" role="alert">
            <div class="min-w-0">
              <p class="text-[13px] font-semibold text-danger-text">{{ t('capture.input.error') }}</p>
              <p class="text-xs text-danger-text">{{ analyzeError }}</p>
            </div>
            <Button size="sm" variant="secondary" @click="analyze">{{ t('capture.input.retry') }}</Button>
          </div>

          <AiLanguagePicker v-model="outputLanguage" class="mt-6" hint />

          <div class="mt-4 flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p class="flex items-start gap-2 text-xs text-muted">
              <Info class="mt-px size-3.5 shrink-0 text-subtle" aria-hidden="true" />{{ t('capture.input.privacy') }}
            </p>
            <Button variant="ai" size="md" class="w-full sm:w-auto sm:shrink-0" :disabled="!canAnalyze" @click="analyze"><Sparkles aria-hidden="true" />{{ t('capture.input.analyze') }}</Button>
          </div>
        </template>
      </div>

      <!-- Step 2: analyzing -->
      <section v-else-if="phase === 'analyzing'" class="mx-auto flex max-w-3xl animate-fade-up flex-col gap-4">
        <div class="relative overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-xs">
          <div class="max-h-[52vh] overflow-hidden whitespace-pre-wrap break-words text-[13px] leading-relaxed text-muted opacity-60" aria-hidden="true">{{ sourcePreview }}</div>
          <div class="scan-line" aria-hidden="true" />
        </div>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2.5" role="status" aria-live="polite">
            <Spinner class="size-4 text-ai" />
            <Transition name="fade" mode="out-in">
              <p :key="msgIndex" class="text-sm font-medium text-fg">{{ t(`capture.analyzing.m${msgIndex}`) }}</p>
            </Transition>
          </div>
          <Button variant="ghost" size="sm" @click="cancelAnalyzing">{{ t('capture.analyzing.cancel') }}</Button>
        </div>
        <p class="text-xs text-subtle">{{ t('capture.analyzing.note') }}</p>
      </section>

      <!-- Step 3: review -->
      <section v-else-if="phase === 'review'">
        <div v-if="draftQ.isPending.value && !draft" class="grid gap-4 lg:grid-cols-2" aria-busy="true">
          <Skeleton :rows="8" />
          <Skeleton :rows="10" />
        </div>
        <EmptyState v-else-if="!draft || !review" :icon="AlertTriangle" :title="t('capture.review.notFound')">
          <Button variant="secondary" @click="startOver(false)">{{ t('capture.review.startOver') }}</Button>
        </EmptyState>

        <template v-else>
          <div v-if="!isPending" class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface-raised px-4 py-3">
            <p class="text-[13px] text-fg">{{ reviewStatus === 'confirmed' ? t('capture.review.confirmedNotice') : t('capture.review.rejectedNotice') }}</p>
            <div class="flex gap-2">
              <Button v-if="reviewStatus === 'confirmed' && (draft.primaryTaskId || draft.primaryGoalId)" size="sm" variant="secondary" @click="openDraftItem">{{ t('capture.review.openCreated') }}</Button>
              <Button size="sm" variant="ghost" @click="startOver(false)">{{ t('capture.review.startOver') }}</Button>
            </div>
          </div>

          <div class="sticky top-[var(--topbar-h)] z-20 -mx-4 mb-4 bg-bg/90 px-4 py-2 backdrop-blur lg:hidden">
            <Segmented v-model="mobileTab" :options="tabOptions" :label="t('capture.review.tabs.label')" class="flex w-full [&>button]:flex-1" />
          </div>

          <div class="grid gap-6 lg:grid-cols-2 lg:items-start">
            <aside
              :aria-label="t('capture.review.sourcePanel')"
              class="min-w-0 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto"
              :class="mobileTab === 'source' ? '' : 'max-lg:hidden'"
            >
              <Card :title="t('capture.review.sourcePanel')" :padded="false">
                <SourceHighlighter v-if="sourceFull" :text="sourceFull" :passages="passages" :focus-key="focusKey" />
                <p v-else class="px-4 pb-4 pt-2 text-sm text-subtle">{{ t('capture.review.sourceDeleted') }}</p>
              </Card>
            </aside>

            <section
              :aria-label="t('capture.review.extractedPanel')"
              class="flex min-w-0 flex-col gap-4"
              :class="mobileTab === 'extracted' ? '' : 'max-lg:hidden'"
            >
              <fieldset :disabled="!isPending" class="contents">
                <ReviewForm :state="review" :projects="projectOptions" @focus-evidence="focusEvidence" />
              </fieldset>
            </section>
          </div>

          <div
            v-if="isPending"
            class="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-20 border-t border-border bg-surface-raised/95 px-4 py-3 backdrop-blur md:sticky md:inset-x-auto md:bottom-0 md:z-10 md:-mx-8 md:mt-6 md:px-8"
          >
            <div class="mx-auto flex max-w-6xl flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-3">
              <div class="min-w-0 md:flex-1">
                <div v-if="issues.length" role="alert" class="max-h-28 overflow-y-auto text-xs text-danger-text">
                  <p class="font-semibold">{{ t('capture.review.footer.errorsTitle') }}</p>
                  <ul class="list-disc pl-4">
                    <li v-for="i in issues" :key="i">{{ i }}</li>
                  </ul>
                </div>
                <p v-else-if="remainingReview" class="truncate text-xs text-muted">{{ t('capture.review.footer.blocked', { n: remainingReview }) }}</p>
              </div>
              <div class="grid grid-cols-2 gap-2 md:flex md:items-center">
                <Button class="w-full md:w-auto" variant="danger-ghost" :disabled="busy" @click="rejectDraft"><Trash2 aria-hidden="true" />{{ t('capture.review.footer.reject') }}</Button>
                <Button class="w-full md:w-auto" variant="primary" :loading="busy" :disabled="remainingReview > 0" @click="confirmDraft">{{ t('capture.review.footer.confirm') }}</Button>
              </div>
            </div>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
.scan-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  top: 0;
  background: var(--color-ai);
  box-shadow: 0 0 14px 2px color-mix(in oklab, var(--color-ai) 45%, transparent);
  animation: scan 2.4s var(--ease-out) infinite;
}
@keyframes scan {
  0% {
    top: 0;
    opacity: 0;
  }
  10%,
  90% {
    opacity: 1;
  }
  100% {
    top: 100%;
    opacity: 0;
  }
}
.done-ring {
  stroke-dasharray: 139;
  stroke-dashoffset: 139;
  animation: draw 0.6s var(--ease-out) forwards;
}
.done-tick {
  stroke-dasharray: 34;
  stroke-dashoffset: 34;
  animation: draw 0.45s 0.45s var(--ease-out) forwards;
}
@keyframes draw {
  to {
    stroke-dashoffset: 0;
  }
}
</style>
