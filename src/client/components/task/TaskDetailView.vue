<script setup lang="ts">
import { computed, reactive, ref, watch, type Component, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import { watchDebounced } from '@vueuse/core'
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  BellRing,
  CalendarDays,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  Hourglass,
  History,
  Layers,
  Link2,
  ListChecks,
  MoveRight,
  MoreHorizontal,
  Paperclip,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  TrendingUp,
  Undo2,
  Unlink,
  X,
} from 'lucide-vue-next'
import TaskCheck from '@/components/domain/TaskCheck.vue'
import CountdownChip from '@/components/domain/CountdownChip.vue'
import RiskBadge from '@/components/domain/RiskBadge.vue'
import TaskRow from '@/components/domain/TaskRow.vue'
import CheckpointList from '@/components/checkpoint/CheckpointList.vue'
import DueEditor from './DueEditor.vue'
import DetailSection from './DetailSection.vue'
import ReminderEditor from './ReminderEditor.vue'
import AiLanguagePicker from '@/components/ai/AiLanguagePicker.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Field from '@/components/ui/Field.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Input from '@/components/ui/Input.vue'
import Menu, { type MenuItem } from '@/components/ui/Menu.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Textarea from '@/components/ui/Textarea.vue'
import { api } from '@/lib/api'
import { useTaskDetail } from '@/composables/useTasks'
import { useTaskActions, useErrorMessage, useProjects, invalidatePlanning } from '@/composables/useTasks'
import { useFormat } from '@/composables/useFormat'
import { useNow } from '@/composables/useNow'
import { useAiLanguage } from '@/composables/useAiLanguage'
import { useToast } from '@/composables/useToast'
import { confirm } from '@/composables/useConfirm'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import { BOARD_STATUSES, LIMITS, PRIORITIES, PROGRESS_MODES, REQUIREMENT_TYPES, REWARD_TYPES } from '@shared/constants'
import { dueSpecSchema, type DueSpec, type TaskLocation, type TaskRequirement, type TaskReward, type TaskSubmission, type TaskUpdateInput } from '@shared/schemas'
import type { HistoryEntry, Paged, Task } from '@/lib/types'

/**
 * Full task detail. Used by the drawer (inDrawer) and the full page.
 * Every edit calls useTaskActions().update (or a transition) and flashes a subtle "Saved".
 * Text fields keep local drafts; they are committed on change (blur or Enter).
 */
const props = defineProps<{ taskId: string; inDrawer?: boolean }>()
const emit = defineEmits<{ close: [] }>()

type SectionKey = 'description' | 'checkpoints' | 'subtasks' | 'dependencies' | 'deliverables' | 'requirements' | 'rewards' | 'location' | 'submission' | 'reminders' | 'attachments' | 'notes' | 'source'
type LocationDraft = Record<'physical' | 'building' | 'room' | 'campus' | 'online' | 'contact', string>
type SubmissionDraft = Record<'method' | 'platform' | 'url' | 'destination' | 'naming' | 'sizeLimit' | 'copies' | 'conditions', string> & { fileFormats: string }
type AiAnalysis = { headline: string; narrative: string; suggestions: string[]; cautions: string[] }

const { t, te } = useI18n()
const router = useRouter()
const qc = useQueryClient()
const session = useSessionStore()
const ui = useUiStore()
const f = useFormat()
const now = useNow()
const toast = useToast()
const errMsg = useErrorMessage()
const actions = useTaskActions()
const { data: projects } = useProjects()
const { data: task, isPending, isError, refetch } = useTaskDetail(() => props.taskId)

const done = computed(() => task.value?.status === 'completed')
const hasDue = computed(() => (task.value?.due.precision ?? 'unknown') !== 'unknown')

// ---- Saving feedback --------------------------------------------------------
const saving = ref(false)
const savedFlash = ref(false)
let savedTimer: ReturnType<typeof setTimeout> | undefined
function flashSaved() {
  savedFlash.value = true
  clearTimeout(savedTimer)
  savedTimer = setTimeout(() => (savedFlash.value = false), 1600)
}

async function runAction(fn: () => Promise<unknown>) {
  saving.value = true
  try {
    await fn()
    flashSaved()
  } catch (e) {
    toast.error(errMsg(e))
    void refetch()
  } finally {
    saving.value = false
  }
}

function save(patch: TaskUpdateInput) {
  return runAction(() => actions.update(props.taskId, patch))
}

function codeMessage(code: string): string {
  const key = `quickAdd.errors.${code}`
  return te(key) ? t(key) : t('quickAdd.errors.generic')
}

// ---- Drafts -------------------------------------------------------------------
const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)))

/**
 * Local draft bound to a server value. The draft adopts new server values only while
 * the user has not edited it (it still equals the previous server value), so background
 * refetches never clobber text being typed.
 */
function draftOf<T>(source: () => T): Ref<T> {
  const d = ref(clone(source())) as Ref<T>
  watch(
    source,
    (v, old) => {
      if (JSON.stringify(d.value) === JSON.stringify(old)) d.value = clone(v)
    },
    { deep: true },
  )
  return d
}

const titleDraft = draftOf(() => task.value?.title ?? '')
const descriptionDraft = draftOf(() => task.value?.description ?? '')
const notesDraft = draftOf(() => task.value?.notes ?? '')
const estimateDraft = draftOf(() => (task.value?.estimatedMinutes == null ? '' : String(task.value.estimatedMinutes)))
const actualDraft = draftOf(() => String(task.value?.actualMinutes ?? 0))
const deliverablesDraft = draftOf<string[]>(() => task.value?.deliverables ?? [])
const requirementsDraft = draftOf<TaskRequirement[]>(() => task.value?.requirements ?? [])
const rewardsDraft = draftOf<TaskReward[]>(() => task.value?.rewards ?? [])
const locationDraft = draftOf<LocationDraft>(() => {
  const l: TaskLocation | null | undefined = task.value?.location
  return { physical: l?.physical ?? '', building: l?.building ?? '', room: l?.room ?? '', campus: l?.campus ?? '', online: l?.online ?? '', contact: l?.contact ?? '' }
})
const submissionDraft = draftOf<SubmissionDraft>(() => {
  const s: TaskSubmission | null | undefined = task.value?.submission
  return {
    method: s?.method ?? '',
    platform: s?.platform ?? '',
    url: s?.url ?? '',
    destination: s?.destination ?? '',
    fileFormats: (s?.fileFormats ?? []).join(', '),
    naming: s?.naming ?? '',
    sizeLimit: s?.sizeLimit ?? '',
    copies: s?.copies ?? '',
    conditions: s?.conditions ?? '',
  }
})
const progressDraft = draftOf(() => task.value?.progressPercent ?? 0)

function commitTitle() {
  const v = titleDraft.value.trim()
  if (!v) return void (titleDraft.value = task.value?.title ?? '')
  if (v !== task.value?.title) void save({ title: v.slice(0, LIMITS.titleMax) })
}

function commitDescription() {
  const v = descriptionDraft.value.trim() || null
  if (v !== (task.value?.description ?? null)) void save({ description: v })
}

function commitNotes() {
  const v = notesDraft.value.trim() || null
  if (v !== (task.value?.notes ?? null)) void save({ notes: v })
}

function parseNumberDraft(raw: string): number | null | undefined {
  const s = raw.trim()
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? Math.min(100_000, Math.round(n)) : undefined
}

function commitEstimate() {
  const n = parseNumberDraft(estimateDraft.value)
  if (n === undefined) return void (estimateDraft.value = task.value?.estimatedMinutes == null ? '' : String(task.value.estimatedMinutes))
  if (n !== (task.value?.estimatedMinutes ?? null)) void save({ estimatedMinutes: n })
}

function commitActual() {
  const n = parseNumberDraft(actualDraft.value)
  if (n === undefined || n === null) return void (actualDraft.value = String(task.value?.actualMinutes ?? 0))
  if (n !== task.value?.actualMinutes) void save({ actualMinutes: n })
}

function commitDeliverables() {
  const list = deliverablesDraft.value.map((s) => s.trim()).filter(Boolean)
  if (JSON.stringify(list) !== JSON.stringify(task.value?.deliverables ?? [])) void save({ deliverables: list.slice(0, LIMITS.listMaxItems) })
}
const newDeliverable = ref('')
function addDeliverable() {
  const v = newDeliverable.value.trim()
  if (!v) return
  newDeliverable.value = ''
  deliverablesDraft.value = [...deliverablesDraft.value, v]
  commitDeliverables()
}
function removeDeliverable(i: number) {
  deliverablesDraft.value = deliverablesDraft.value.filter((_, idx) => idx !== i)
  commitDeliverables()
}

function commitRequirements() {
  const list = requirementsDraft.value.map((r) => ({ text: r.text.trim(), type: r.type })).filter((r) => r.text)
  if (JSON.stringify(list) !== JSON.stringify(task.value?.requirements ?? [])) void save({ requirements: list })
}
const newRequirement = ref('')
const newRequirementType = ref<TaskRequirement['type']>('mandatory')
function addRequirement() {
  const v = newRequirement.value.trim()
  if (!v) return
  requirementsDraft.value = [...requirementsDraft.value, { text: v, type: newRequirementType.value }]
  newRequirement.value = ''
  commitRequirements()
}
function removeRequirement(i: number) {
  requirementsDraft.value = requirementsDraft.value.filter((_, idx) => idx !== i)
  commitRequirements()
}
function setRequirementType(i: number, type: TaskRequirement['type']) {
  requirementsDraft.value = requirementsDraft.value.map((r, idx) => (idx === i ? { ...r, type } : r))
  commitRequirements()
}

function commitRewards() {
  const list = rewardsDraft.value.map((r) => ({ text: r.text.trim(), type: r.type })).filter((r) => r.text)
  if (JSON.stringify(list) !== JSON.stringify(task.value?.rewards ?? [])) void save({ rewards: list })
}
const newReward = ref('')
const newRewardType = ref<TaskReward['type']>('other')
function addReward() {
  const v = newReward.value.trim()
  if (!v) return
  rewardsDraft.value = [...rewardsDraft.value, { text: v, type: newRewardType.value }]
  newReward.value = ''
  commitRewards()
}
function removeReward(i: number) {
  rewardsDraft.value = rewardsDraft.value.filter((_, idx) => idx !== i)
  commitRewards()
}
function setRewardType(i: number, type: TaskReward['type']) {
  rewardsDraft.value = rewardsDraft.value.map((r, idx) => (idx === i ? { ...r, type } : r))
  commitRewards()
}

function commitLocation() {
  const d = locationDraft.value
  const clean = {
    physical: d.physical.trim() || null,
    building: d.building.trim() || null,
    room: d.room.trim() || null,
    campus: d.campus.trim() || null,
    online: d.online.trim() || null,
    contact: d.contact.trim() || null,
  }
  const empty = Object.values(clean).every((v) => v === null)
  const current = task.value?.location ?? null
  if (JSON.stringify(empty ? null : clean) !== JSON.stringify(current ? { ...current } : null)) void save({ location: empty ? null : clean })
}

function commitSubmission() {
  const d = submissionDraft.value
  const url = d.url.trim()
  if (url && !/^https?:\/\//i.test(url)) return void toast.error(codeMessage('INVALID_URL'))
  const formats = d.fileFormats.split(',').map((s) => s.trim()).filter(Boolean)
  const clean = {
    method: d.method.trim() || null,
    platform: d.platform.trim() || null,
    url: url || null,
    destination: d.destination.trim() || null,
    fileFormats: formats,
    naming: d.naming.trim() || null,
    sizeLimit: d.sizeLimit.trim() || null,
    copies: d.copies.trim() || null,
    conditions: d.conditions.trim() || null,
  }
  const empty = Object.entries(clean).every(([k, v]) => (k === 'fileFormats' ? (v as string[]).length === 0 : v === null))
  void save({ submission: empty ? null : clean })
}

function commitProgress() {
  const value = progressDraft.value
  if (value === task.value?.progressPercent) return
  void runAction(async () => {
    await api.post('/progress', { taskId: props.taskId, value })
    invalidatePlanning(qc)
  })
}

// ---- Header actions -----------------------------------------------------------
const statusOptions = computed(() => {
  const opts: { value: string; label: string }[] = BOARD_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))
  if (task.value?.status === 'archived') opts.push({ value: 'archived', label: t('status.archived') })
  return opts
})

async function setStatus(next: string) {
  const x = task.value
  if (!x || next === x.status) return
  const target = next as Task['status']
  await runAction(async () => {
    if (target === 'completed') await actions.transition(x.id, 'complete')
    else if (x.status === 'completed') {
      await actions.transition(x.id, 'reopen')
      if (target !== 'in_progress') await actions.update(x.id, { status: target })
    } else if (target === 'paused') await actions.transition(x.id, 'pause')
    else if (x.status === 'paused' && target === 'in_progress') await actions.transition(x.id, 'resume')
    else await actions.update(x.id, { status: target })
  })
}

const priorityOptions = computed(() => PRIORITIES.map((p) => ({ value: p, label: t(`priority.${p}`) })))
const progressModeOptions = computed(() => PROGRESS_MODES.map((m) => ({ value: m, label: t(`taskDetail.progress.mode.${m}`) })))
const projectOptions = computed(() => [
  { value: '', label: t('taskDetail.fields.noProject') },
  ...(projects.value ?? []).filter((p) => p.status === 'active' || p.id === task.value?.projectId).map((p) => ({ value: p.id, label: p.name })),
])
const requirementTypeOptions = computed(() => REQUIREMENT_TYPES.map((x) => ({ value: x, label: t(`taskDetail.requirementType.${x}`) })))
const rewardTypeOptions = computed(() => REWARD_TYPES.map((x) => ({ value: x, label: t(`taskDetail.rewardType.${x}`) })))

async function duplicate() {
  try {
    const newId = await actions.duplicate(props.taskId)
    if (props.inDrawer) ui.openTask(newId)
    else router.push(`/tasks/${newId}`)
  } catch (e) {
    toast.error(errMsg(e))
  }
}

async function transition(action: 'pause' | 'resume' | 'archive' | 'unarchive') {
  await runAction(() => actions.transition(props.taskId, action))
}

async function removeTask() {
  const x = task.value
  if (!x) return
  const ok = await confirm({
    title: t('taskList.confirmDelete.title', { title: x.title }),
    message: t('taskList.confirmDelete.message'),
    danger: true,
    confirmLabel: t('taskList.confirmDelete.confirm'),
  })
  if (!ok) return
  try {
    await actions.remove({ id: x.id, title: x.title })
    if (props.inDrawer) emit('close')
    else router.push('/inbox')
  } catch (e) {
    toast.error(errMsg(e))
  }
}

const menuItems = computed<MenuItem[]>(() => {
  const x = task.value
  if (!x) return []
  const items: MenuItem[] = [{ label: t('taskDetail.actions.duplicate'), icon: Copy, onSelect: () => void duplicate() }]
  if (x.status === 'paused') items.push({ label: t('taskDetail.actions.resume'), icon: Play, onSelect: () => void transition('resume') })
  else if (x.status !== 'completed' && x.status !== 'archived') items.push({ label: t('taskDetail.actions.pause'), icon: Pause, onSelect: () => void transition('pause') })
  if (x.status === 'archived') items.push({ label: t('taskDetail.actions.unarchive'), icon: ArchiveRestore, onSelect: () => void transition('unarchive') })
  else items.push({ label: t('taskDetail.actions.archive'), icon: Archive, onSelect: () => void transition('archive') })
  if (props.inDrawer) items.push({ separator: true }, { label: t('taskDetail.openFullPage'), icon: ExternalLink, onSelect: () => router.push(`/tasks/${x.id}`) })
  items.push({ separator: true }, { label: t('taskDetail.actions.delete'), icon: Trash2, danger: true, onSelect: () => void removeTask() })
  return items
})

// ---- Due date ------------------------------------------------------------------
const dueOpen = ref(false)
const dueDraft = ref<DueSpec>({ precision: 'unknown' })
const dueErrors = ref<Partial<Record<'date' | 'time' | 'timeZone', string>>>({})

function openDue() {
  const d = task.value?.due
  dueDraft.value = d ? { precision: d.precision, date: d.date, time: d.time, timeZone: d.timeZone } : { precision: 'unknown' }
  dueErrors.value = {}
  dueOpen.value = true
}

async function saveDue() {
  const parsed = dueSpecSchema.safeParse(dueDraft.value)
  if (!parsed.success) {
    const next: Partial<Record<'date' | 'time' | 'timeZone', string>> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '')
      if (key === 'date' || key === 'time' || key === 'timeZone') next[key] = codeMessage(issue.message)
    }
    dueErrors.value = next
    return
  }
  await save({ due: parsed.data })
  dueOpen.value = false
}

async function clearDue() {
  dueDraft.value = { precision: 'unknown' }
  await saveDue()
}

// ---- Subtasks ---------------------------------------------------------------------
const subtaskTitle = ref('')
async function addSubtask() {
  const title = subtaskTitle.value.trim()
  if (!title || !task.value) return
  try {
    await actions.create({ title: title.slice(0, LIMITS.titleMax), kind: 'task', parentId: props.taskId, projectId: task.value.projectId })
    subtaskTitle.value = ''
  } catch (e) {
    toast.error(errMsg(e))
  }
}

// ---- Dependencies ------------------------------------------------------------------
const depQuery = ref('')
const depResults = ref<Task[]>([])
const depSearching = ref(false)
watchDebounced(
  depQuery,
  async (q) => {
    const s = q.trim()
    if (!s) {
      depResults.value = []
      return
    }
    depSearching.value = true
    try {
      const r = await api.get<Paged<Task>>('/tasks', { view: 'all', q: s, limit: 8 })
      const linked = new Set((task.value?.dependencies ?? []).map((d) => d.dependsOnId))
      depResults.value = r.items.filter((x) => x.id !== props.taskId && !linked.has(x.id))
    } catch (e) {
      depResults.value = []
      toast.error(errMsg(e))
    } finally {
      depSearching.value = false
    }
  },
  { debounce: 250 },
)

async function addDependency(dep: Task) {
  await runAction(async () => {
    await api.post(`/tasks/${props.taskId}/dependencies`, { dependsOnId: dep.id, type: 'finish_to_start' })
    depQuery.value = ''
    depResults.value = []
    invalidatePlanning(qc)
  })
}

async function removeDependency(depId: string) {
  await runAction(async () => {
    await api.del(`/tasks/${props.taskId}/dependencies/${depId}`)
    invalidatePlanning(qc)
  })
}

// ---- Attachments ----------------------------------------------------------------
const uploading = ref(false)
async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (file.size > LIMITS.attachmentMaxBytes) return void toast.error(t('errors.PAYLOAD_TOO_LARGE'))
  const form = new FormData()
  form.append('file', file)
  uploading.value = true
  try {
    await api.upload(`/tasks/${props.taskId}/attachments`, form)
    invalidatePlanning(qc)
    flashSaved()
  } catch (err) {
    toast.error(errMsg(err))
  } finally {
    uploading.value = false
  }
}

async function removeAttachment(a: { id: string; filename: string }) {
  const ok = await confirm({ title: t('taskDetail.attachments.removeConfirm', { name: a.filename }), danger: true, confirmLabel: t('common.delete') })
  if (!ok) return
  await runAction(async () => {
    await api.del(`/attachments/${a.id}`)
    invalidatePlanning(qc)
  })
}

function sizeLabel(bytes: number): string {
  return bytes >= 1024 * 1024 ? t('taskDetail.attachments.mb', { n: f.number(bytes / (1024 * 1024), 1) }) : t('taskDetail.attachments.kb', { n: Math.max(1, Math.round(bytes / 1024)) })
}

// ---- History ----------------------------------------------------------------------
const historyIcons: Record<string, Component> = {
  created: Plus,
  updated: Pencil,
  completed: CheckCircle2,
  reopened: Undo2,
  paused: Pause,
  resumed: Play,
  archived: Archive,
  unarchived: ArchiveRestore,
  status_changed: Layers,
  deadline_changed: CalendarDays,
  progress_updated: TrendingUp,
  estimate_revised: Hourglass,
  moved: MoveRight,
  duplicated: Copy,
  deleted: Trash2,
  restored: RotateCcw,
  dependency_added: Link2,
  dependency_removed: Unlink,
  checkpoint_added: ListChecks,
  checkpoint_completed: CheckCircle2,
  checkpoint_reopened: RotateCcw,
  reminder_added: Bell,
  reminder_modified: BellRing,
  reminder_removed: BellOff,
  ai_plan_confirmed: Sparkles,
}
const historySorted = computed<HistoryEntry[]>(() => [...(task.value?.history ?? [])].sort((a, b) => b.createdAt - a.createdAt))
const showAllHistory = ref(false)
const historyShown = computed(() => (showAllHistory.value ? historySorted.value : historySorted.value.slice(0, 8)))
function actionLabel(action: string): string {
  const key = `history.action.${action}`
  return te(key) ? t(key) : action
}

// ---- AI ------------------------------------------------------------------------------
const aiBusy = ref<'plan' | 'analyze' | null>(null)
const analysis = ref<AiAnalysis | null>(null)
const aiEnabled = computed(() => session.settings?.aiEnabled !== false)
const outputLanguage = useAiLanguage()

async function generatePlan() {
  aiBusy.value = 'plan'
  try {
    const draft = await api.post<{ draftId: string }>('/ai/checkpoints', { taskId: props.taskId, outputLanguage: outputLanguage.value })
    router.push(`/plan/${draft.draftId}`)
  } catch (e) {
    toast.error(errMsg(e))
  } finally {
    aiBusy.value = null
  }
}

async function analyze() {
  aiBusy.value = 'analyze'
  try {
    const r = await api.post<{ analysis: AiAnalysis }>('/ai/analyze', { taskId: props.taskId, outputLanguage: outputLanguage.value })
    analysis.value = r.analysis
  } catch (e) {
    toast.error(errMsg(e))
  } finally {
    aiBusy.value = null
  }
}

// ---- Section visibility ------------------------------------------------------------
function hasAny(obj: object | null | undefined): boolean {
  return !!obj && Object.values(obj).some((v) => (Array.isArray(v) ? v.length > 0 : v != null && v !== ''))
}
const contentFlags = computed<Record<SectionKey, boolean>>(() => {
  const x = task.value
  return {
    description: !!x?.description,
    checkpoints: !!x?.checkpoints.length,
    subtasks: !!x?.subtasks.length,
    dependencies: !!(x?.dependencies.length || x?.dependents.length),
    deliverables: !!x?.deliverables.length,
    requirements: !!x?.requirements.length,
    rewards: !!x?.rewards.length,
    location: hasAny(x?.location),
    submission: hasAny(x?.submission),
    reminders: !!x?.reminders.length,
    attachments: !!x?.attachments.length,
    notes: !!x?.notes,
    source: !!x?.source,
  }
})
const revealed = reactive<Record<SectionKey, boolean>>({
  description: false,
  checkpoints: false,
  subtasks: false,
  dependencies: false,
  deliverables: false,
  requirements: false,
  rewards: false,
  location: false,
  submission: false,
  reminders: false,
  attachments: false,
  notes: false,
  source: false,
})
function shown(k: SectionKey): boolean {
  return contentFlags.value[k] || revealed[k]
}
const hiddenSections = computed(() => (Object.keys(contentFlags.value) as SectionKey[]).filter((k) => !shown(k)))

const reasonText = (r: { code: string; params?: Record<string, number | string> }) => f.riskReason(r)

const fileInput = ref<HTMLInputElement | null>(null)
const LOCATION_KEYS = ['physical', 'building', 'room', 'campus', 'online', 'contact'] as const
const subtaskDone = computed(() => task.value?.counts.subtasksDone ?? 0)
const newDepsCount = computed(() => task.value?.dependencies.length ?? 0)
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <!-- Loading / error -->
    <div v-if="isPending" class="p-5" aria-busy="true">
      <Skeleton :rows="6" height="44px" />
    </div>
    <EmptyState v-else-if="isError || !task" :icon="AlertTriangle" :title="t('taskDetail.loadFailed')" :description="t('errors.tryAgainHint')" class="py-10">
      <Button @click="refetch()">{{ t('common.retry') }}</Button>
    </EmptyState>

    <template v-else>
      <!-- Sticky header -->
      <header
        class="z-10 flex shrink-0 items-start gap-3 border-b border-border bg-surface-raised px-5 py-4"
        :class="inDrawer ? '' : 'sticky top-0 max-md:top-[var(--topbar-h)]'"
      >
        <TaskCheck
          class="mt-1.5"
          size="md"
          :checked="done"
          :priority="task.priority"
          :shape="task.kind === 'deadline' ? 'diamond' : 'circle'"
          :label="done ? t('task.markIncomplete', { title: task.title }) : t('task.markComplete', { title: task.title })"
          @toggle="actions.toggleComplete.mutate(task)"
        />
        <div class="min-w-0 flex-1">
          <Input
            v-model="titleDraft"
            :aria-label="t('taskDetail.titleLabel')"
            :placeholder="t('taskDetail.untitled')"
            maxlength="300"
            class="h-auto border-transparent bg-transparent px-1.5 py-1 text-[17px] font-semibold tracking-tight shadow-none hover:border-border hover:bg-surface-hover focus:border-primary focus:bg-surface"
            :class="done ? 'line-through decoration-subtle' : ''"
            @change="commitTitle"
            @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
          />
          <div class="mt-1 flex flex-wrap items-center gap-2 px-1.5">
            <Badge :tone="done ? 'success' : task.status === 'paused' ? 'warning' : 'neutral'" dot>{{ t(`status.${task.status}`) }}</Badge>
            <Badge v-if="task.kind === 'deadline'" tone="primary">{{ t('task.kind.deadline') }}</Badge>
            <span class="min-h-4 text-xs" role="status" aria-live="polite">
              <Transition name="fade" mode="out-in">
                <span v-if="saving" key="saving" class="text-muted">{{ t('common.saving') }}</span>
                <span v-else-if="savedFlash" key="saved" class="inline-flex items-center gap-1 text-success-text"><Check class="size-3.5" aria-hidden="true" />{{ t('taskDetail.saved') }}</span>
              </Transition>
            </span>
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <Menu :items="menuItems" width="220px">
            <IconButton class="max-md:size-11" :label="t('taskDetail.moreActions')">
              <MoreHorizontal aria-hidden="true" />
            </IconButton>
          </Menu>
          <IconButton v-if="inDrawer" class="max-md:size-11" :label="t('common.close')" @click="emit('close')">
            <X aria-hidden="true" />
          </IconButton>
        </div>
      </header>

      <div class="min-h-0 flex-1 px-5 pb-10 pt-5" :class="inDrawer && 'overflow-y-auto'">
        <!-- Deadline and risk -->
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="rounded-xl bg-surface-sunken p-3.5">
            <p class="text-[11px] font-medium uppercase tracking-wide text-subtle">{{ t('taskDetail.fields.due') }}</p>
            <template v-if="hasDue">
              <div class="mt-2"><CountdownChip :due="task.due" size="md" :completed="done" /></div>
              <p class="mt-2 text-xs text-muted">{{ f.due(task.due) }}</p>
            </template>
            <p v-else class="mt-2 text-sm text-muted">{{ t('taskDetail.fields.noDate') }}</p>
          </div>
          <div class="rounded-xl bg-surface-sunken p-3.5">
            <p class="text-[11px] font-medium uppercase tracking-wide text-subtle">{{ t('taskDetail.risk.title') }}</p>
            <div class="mt-2"><RiskBadge :risk="task.risk" /></div>
            <ul v-if="task.risk.reasons.length" class="mt-2 flex flex-col gap-1 text-xs text-muted">
              <li v-for="(r, i) in task.risk.reasons" :key="i" class="flex items-start gap-1.5">
                <span class="mt-1.5 size-1 shrink-0 rounded-full bg-subtle" aria-hidden="true" />
                <span>{{ reasonText(r) }}</span>
              </li>
            </ul>
          </div>
        </div>

        <!-- Property grid -->
        <div class="mt-5 grid gap-x-4 gap-y-4 sm:grid-cols-2">
          <Field v-slot="{ id }" :label="t('taskDetail.fields.status')">
            <Select :id="id" :model-value="task.status" :options="statusOptions" @update:model-value="(v) => setStatus(String(v))" />
          </Field>
          <Field v-slot="{ id }" :label="t('taskDetail.fields.priority')">
            <Select :id="id" :model-value="task.priority" :options="priorityOptions" @update:model-value="(v) => save({ priority: v as Task['priority'] })" />
          </Field>

          <div class="flex flex-col gap-1.5 sm:col-span-2">
            <div class="flex items-center justify-between gap-2">
              <span class="text-[13px] font-medium text-fg">{{ t('taskDetail.fields.due') }}</span>
              <Button v-if="!dueOpen" variant="ghost" size="xs" @click="openDue">{{ t('taskDetail.fields.change') }}</Button>
            </div>
            <Transition name="fade">
              <div v-if="dueOpen" class="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3.5">
                <p class="text-[13px] font-medium text-fg">{{ t('taskDetail.dueEdit.title') }}</p>
                <DueEditor v-model="dueDraft" :errors="dueErrors" />
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <Button variant="danger-ghost" size="sm" :disabled="saving" @click="clearDue">{{ t('taskDetail.dueEdit.clear') }}</Button>
                  <div class="flex gap-2">
                    <Button variant="ghost" size="sm" @click="dueOpen = false">{{ t('common.cancel') }}</Button>
                    <Button variant="primary" size="sm" :loading="saving" @click="saveDue">{{ t('taskDetail.dueEdit.save') }}</Button>
                  </div>
                </div>
              </div>
            </Transition>
            <p v-if="!dueOpen" class="text-xs text-muted">{{ hasDue ? f.due(task.due) : t('taskDetail.fields.noDate') }}</p>
          </div>

          <Field v-slot="{ id }" :label="t('taskDetail.fields.startDate')">
            <Input :id="id" type="date" :model-value="task.startDate ?? ''" @update:model-value="(v) => save({ startDate: String(v || '') || null })" />
          </Field>
          <Field v-slot="{ id }" :label="t('taskDetail.fields.scheduledDate')">
            <Input :id="id" type="date" :model-value="task.scheduledDate ?? ''" @update:model-value="(v) => save({ scheduledDate: String(v || '') || null })" />
          </Field>
          <Field v-slot="{ id }" :label="t('taskDetail.fields.project')">
            <Select :id="id" :model-value="task.projectId ?? ''" :options="projectOptions" @update:model-value="(v) => save({ projectId: String(v) || null })" />
          </Field>
          <div class="grid gap-3 sm:grid-cols-2">
            <Field v-slot="{ id }" :label="t('taskDetail.fields.estimate')" :hint="f.minutes(task.estimatedMinutes)">
              <Input :id="id" v-model="estimateDraft" type="number" min="0" :placeholder="t('taskDetail.fields.minutesPlaceholder')" @change="commitEstimate" />
            </Field>
            <Field v-slot="{ id }" :label="t('taskDetail.fields.actual')" :hint="f.minutes(task.actualMinutes)">
              <Input :id="id" v-model="actualDraft" type="number" min="0" :placeholder="t('taskDetail.fields.minutesPlaceholder')" @change="commitActual" />
            </Field>
          </div>

          <!-- Progress -->
          <div class="flex flex-col gap-2 sm:col-span-2">
            <div class="flex items-center justify-between gap-2">
              <span class="text-[13px] font-medium text-fg">{{ t('taskDetail.fields.progress') }}</span>
              <span class="tabular text-xs text-muted">{{ f.percent(task.progressPercent / 100) }}</span>
            </div>
            <ProgressBar :value="task.progressPercent" size="md" :expected="task.risk.expectedProgress" :tone="task.risk.level === 'at_risk' || task.risk.level === 'overdue' ? 'danger' : 'primary'" :label="t('taskDetail.fields.progress')" />
            <p v-if="task.risk.expectedProgress != null" class="text-xs text-muted">{{ t('taskDetail.progress.expected', { n: Math.round(task.risk.expectedProgress) }) }}</p>
            <div class="grid gap-3 sm:grid-cols-[1fr_200px] sm:items-end">
              <input
                v-if="task.progressMode === 'manual'"
                v-model.number="progressDraft"
                type="range"
                min="0"
                max="100"
                step="5"
                class="h-8 w-full accent-primary"
                :aria-label="t('taskDetail.progress.slider')"
                :disabled="saving"
                @change="commitProgress"
              />
              <p v-else class="text-xs text-muted">{{ task.progressMode === 'checkpoints' ? t('taskDetail.progress.autoCheckpoints') : t('taskDetail.progress.autoSubtasks') }}</p>
              <Field v-slot="{ id }" :label="t('taskDetail.progress.modeLabel')">
                <Select :id="id" :model-value="task.progressMode" :options="progressModeOptions" @update:model-value="(v) => save({ progressMode: v as Task['progressMode'] })" />
              </Field>
            </div>
          </div>
        </div>

        <!-- AI actions -->
        <div class="mt-6 flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
          <div class="flex items-center gap-2">
            <Sparkles class="size-4 text-ai" aria-hidden="true" />
            <h3 class="text-[13px] font-semibold text-fg">{{ t('taskDetail.ai.title') }}</h3>
          </div>
          <div class="flex flex-wrap gap-2">
            <Button variant="ai" size="sm" :disabled="!aiEnabled || aiBusy !== null" :loading="aiBusy === 'plan'" @click="generatePlan">
              <Sparkles class="size-4" aria-hidden="true" />{{ aiBusy === 'plan' ? t('taskDetail.ai.generating') : t('taskDetail.ai.generate') }}
            </Button>
            <Button variant="soft" size="sm" :disabled="!aiEnabled || aiBusy !== null" :loading="aiBusy === 'analyze'" @click="analyze">
              {{ aiBusy === 'analyze' ? t('taskDetail.ai.analyzing') : t('taskDetail.ai.analyze') }}
            </Button>
          </div>
          <AiLanguagePicker v-model="outputLanguage" hint />
          <p class="text-xs text-subtle">{{ aiEnabled ? t('taskDetail.ai.hint') : t('taskDetail.ai.disabled') }}</p>

          <!-- AI narrative kept visually separate from the deterministic metrics above -->
          <Transition name="fade">
            <div v-if="analysis" class="flex flex-col gap-3 rounded-xl border border-ai/30 bg-ai-soft/40 p-4">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <Badge tone="ai"><Sparkles aria-hidden="true" />{{ t('taskDetail.ai.resultLabel') }}</Badge>
                <IconButton :label="t('taskDetail.ai.dismiss')" size="sm" @click="analysis = null"><X aria-hidden="true" /></IconButton>
              </div>
              <p class="text-sm font-semibold text-fg">{{ analysis.headline }}</p>
              <p class="text-sm leading-relaxed text-muted">{{ analysis.narrative }}</p>
              <div v-if="analysis.suggestions.length">
                <p class="text-xs font-semibold text-fg">{{ t('taskDetail.ai.suggestions') }}</p>
                <ul class="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">
                  <li v-for="(s, i) in analysis.suggestions" :key="i">{{ s }}</li>
                </ul>
              </div>
              <div v-if="analysis.cautions.length">
                <p class="text-xs font-semibold text-fg">{{ t('taskDetail.ai.cautions') }}</p>
                <ul class="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">
                  <li v-for="(c, i) in analysis.cautions" :key="i">{{ c }}</li>
                </ul>
              </div>
            </div>
          </Transition>
        </div>

        <!-- Sections -->
        <!-- Section headers (DetailSection) get 44px tap targets on mobile -->
        <div class="mt-6 flex flex-col gap-5 max-md:[&>section>h3>button]:min-h-11">
          <!-- Description -->
          <DetailSection v-if="shown('description')" :title="t('taskDetail.sections.description.title')" :default-open="true">
            <Textarea v-model="descriptionDraft" rows="4" :placeholder="t('taskDetail.sections.description.placeholder')" :aria-label="t('taskDetail.sections.description.title')" @change="commitDescription" />
          </DetailSection>

          <!-- Checkpoints -->
          <DetailSection v-if="shown('checkpoints')" :title="t('taskDetail.sections.checkpoints.title')" :count="task.checkpoints.length || null">
            <CheckpointList :checkpoints="task.checkpoints" :parent="{ taskId: task.id }" />
          </DetailSection>

          <!-- Subtasks -->
          <DetailSection v-if="shown('subtasks')" :title="t('taskDetail.sections.subtasks.title')" :count="task.subtasks.length || null">
            <div class="flex flex-col gap-2">
              <p v-if="task.subtasks.length" class="text-xs text-muted tabular">{{ subtaskDone }}/{{ task.subtasks.length }}</p>
              <TransitionGroup v-if="task.subtasks.length" name="list" tag="div" class="tap-task-rows relative flex flex-col" role="list">
                <TaskRow v-for="sub in task.subtasks" :key="sub.id" :task="sub" :show-project="false" dense />
              </TransitionGroup>
              <p v-else class="text-xs text-subtle">{{ t('taskDetail.sections.subtasks.empty') }}</p>
              <form class="flex items-center gap-2" @submit.prevent="addSubtask">
                <Input v-model="subtaskTitle" size="sm" class="min-w-0 flex-1" maxlength="300" :placeholder="t('taskDetail.sections.subtasks.placeholder')" :aria-label="t('taskDetail.sections.subtasks.add')" />
                <Button type="submit" variant="soft" size="sm" :disabled="!subtaskTitle.trim()"><Plus class="size-4" aria-hidden="true" />{{ t('taskDetail.sections.subtasks.add') }}</Button>
              </form>
            </div>
          </DetailSection>

          <!-- Dependencies -->
          <DetailSection v-if="shown('dependencies')" :title="t('taskDetail.sections.dependencies.title')" :count="newDepsCount || null">
            <div class="flex flex-col gap-4">
              <div v-if="task.dependencies.length" class="flex flex-col gap-1.5">
                <p class="text-xs font-medium text-muted">{{ t('taskDetail.sections.dependencies.blockedBy') }}</p>
                <div v-for="dep in task.dependencies" :key="dep.id" class="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-hover">
                  <Unlink class="size-3.5 shrink-0 text-subtle" aria-hidden="true" />
                  <button type="button" class="min-w-0 flex-1 truncate text-left text-sm text-fg hover:underline" @click="ui.openTask(dep.dependsOnId)">{{ dep.title }}</button>
                  <Badge tone="neutral">{{ t(`status.${dep.status}`) }}</Badge>
                  <IconButton :label="t('taskDetail.sections.dependencies.remove')" size="sm" :disabled="saving" @click="removeDependency(dep.id)"><X aria-hidden="true" /></IconButton>
                </div>
              </div>
              <div v-if="task.dependents.length" class="flex flex-col gap-1.5">
                <p class="text-xs font-medium text-muted">{{ t('taskDetail.sections.dependencies.dependents') }}</p>
                <button v-for="d in task.dependents" :key="d.taskId" type="button" class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-fg hover:bg-surface-hover" @click="ui.openTask(d.taskId)">
                  <Link2 class="size-3.5 shrink-0 text-subtle" aria-hidden="true" />
                  <span class="min-w-0 flex-1 truncate">{{ d.title }}</span>
                </button>
              </div>
              <div class="flex flex-col gap-2">
                <Input v-model="depQuery" size="sm" type="search" :placeholder="t('taskDetail.sections.dependencies.searchPlaceholder')" :aria-label="t('taskDetail.sections.dependencies.add')" />
                <div v-if="depQuery.trim()" class="flex flex-col gap-0.5" role="listbox" :aria-busy="depSearching">
                  <button v-for="r in depResults" :key="r.id" type="button" role="option" :aria-selected="false" class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-fg hover:bg-surface-hover" :disabled="saving" @click="addDependency(r)">
                    <Plus class="size-3.5 shrink-0 text-primary-text" aria-hidden="true" />
                    <span class="min-w-0 flex-1 truncate">{{ r.title }}</span>
                    <Badge tone="neutral">{{ t(`status.${r.status}`) }}</Badge>
                  </button>
                  <p v-if="!depSearching && !depResults.length" class="px-2 py-1.5 text-xs text-subtle">{{ t('taskDetail.sections.dependencies.searchEmpty') }}</p>
                </div>
              </div>
              <p v-if="!task.dependencies.length && !task.dependents.length && !depQuery.trim()" class="text-xs text-subtle">{{ t('taskDetail.sections.dependencies.empty') }}</p>
            </div>
          </DetailSection>

          <!-- Deliverables -->
          <DetailSection v-if="shown('deliverables')" :title="t('taskDetail.sections.deliverables.title')" :count="deliverablesDraft.length || null">
            <div class="flex flex-col gap-2">
              <div v-for="(_, i) in deliverablesDraft" :key="i" class="flex items-center gap-2">
                <Input v-model="deliverablesDraft[i]" size="sm" class="flex-1" maxlength="2000" :aria-label="t('taskDetail.sections.deliverables.title')" @change="commitDeliverables" />
                <IconButton :label="t('common.remove')" size="sm" @click="removeDeliverable(i)"><X aria-hidden="true" /></IconButton>
              </div>
              <form class="flex items-center gap-2" @submit.prevent="addDeliverable">
                <Input v-model="newDeliverable" size="sm" class="flex-1" maxlength="2000" :placeholder="t('taskDetail.sections.deliverables.placeholder')" :aria-label="t('taskDetail.sections.deliverables.placeholder')" />
                <Button type="submit" variant="soft" size="sm" :disabled="!newDeliverable.trim()">{{ t('taskDetail.sections.deliverables.add') }}</Button>
              </form>
              <p v-if="!deliverablesDraft.length" class="text-xs text-subtle">{{ t('taskDetail.sections.deliverables.empty') }}</p>
            </div>
          </DetailSection>

          <!-- Requirements -->
          <DetailSection v-if="shown('requirements')" :title="t('taskDetail.sections.requirements.title')" :count="requirementsDraft.length || null">
            <div class="flex flex-col gap-2">
              <div v-for="(r, i) in requirementsDraft" :key="i" class="flex flex-wrap items-center gap-2">
                <Input v-model="requirementsDraft[i].text" size="sm" class="min-w-0 flex-1" maxlength="2000" :aria-label="t('taskDetail.sections.requirements.title')" @change="commitRequirements" />
                <Select size="sm" class="w-40" :model-value="r.type" :options="requirementTypeOptions" :aria-label="t('taskDetail.sections.requirements.type')" @update:model-value="(v) => setRequirementType(i, v as TaskRequirement['type'])" />
                <IconButton :label="t('common.remove')" size="sm" @click="removeRequirement(i)"><X aria-hidden="true" /></IconButton>
              </div>
              <form class="flex flex-wrap items-center gap-2" @submit.prevent="addRequirement">
                <Input v-model="newRequirement" size="sm" class="min-w-0 flex-1" maxlength="2000" :placeholder="t('taskDetail.sections.requirements.placeholder')" :aria-label="t('taskDetail.sections.requirements.placeholder')" />
                <Select v-model="newRequirementType" size="sm" class="w-40" :options="requirementTypeOptions" :aria-label="t('taskDetail.sections.requirements.type')" />
                <Button type="submit" variant="soft" size="sm" :disabled="!newRequirement.trim()">{{ t('taskDetail.sections.deliverables.add') }}</Button>
              </form>
              <p v-if="!requirementsDraft.length" class="text-xs text-subtle">{{ t('taskDetail.sections.requirements.empty') }}</p>
            </div>
          </DetailSection>

          <!-- Rewards -->
          <DetailSection v-if="shown('rewards')" :title="t('taskDetail.sections.rewards.title')" :count="rewardsDraft.length || null">
            <div class="flex flex-col gap-2">
              <div v-for="(r, i) in rewardsDraft" :key="i" class="flex flex-wrap items-center gap-2">
                <Input v-model="rewardsDraft[i].text" size="sm" class="min-w-0 flex-1" maxlength="2000" :aria-label="t('taskDetail.sections.rewards.title')" @change="commitRewards" />
                <Select size="sm" class="w-40" :model-value="r.type" :options="rewardTypeOptions" :aria-label="t('taskDetail.sections.rewards.type')" @update:model-value="(v) => setRewardType(i, v as TaskReward['type'])" />
                <IconButton :label="t('common.remove')" size="sm" @click="removeReward(i)"><X aria-hidden="true" /></IconButton>
              </div>
              <form class="flex flex-wrap items-center gap-2" @submit.prevent="addReward">
                <Input v-model="newReward" size="sm" class="min-w-0 flex-1" maxlength="2000" :placeholder="t('taskDetail.sections.rewards.placeholder')" :aria-label="t('taskDetail.sections.rewards.placeholder')" />
                <Select v-model="newRewardType" size="sm" class="w-40" :options="rewardTypeOptions" :aria-label="t('taskDetail.sections.rewards.type')" />
                <Button type="submit" variant="soft" size="sm" :disabled="!newReward.trim()">{{ t('taskDetail.sections.deliverables.add') }}</Button>
              </form>
              <p v-if="!rewardsDraft.length" class="text-xs text-subtle">{{ t('taskDetail.sections.rewards.empty') }}</p>
            </div>
          </DetailSection>

          <!-- Location -->
          <DetailSection v-if="shown('location')" :title="t('taskDetail.sections.location.title')">
            <div class="grid gap-3 sm:grid-cols-2">
              <Field v-for="k in LOCATION_KEYS" :key="k" v-slot="{ id }" :label="t(`taskDetail.location.${k}`)">
                <Input :id="id" v-model="locationDraft[k]" size="sm" maxlength="1000" @change="commitLocation" />
              </Field>
            </div>
          </DetailSection>

          <!-- Submission -->
          <DetailSection v-if="shown('submission')" :title="t('taskDetail.sections.submission.title')">
            <div class="grid gap-3 sm:grid-cols-2">
              <Field v-slot="{ id }" :label="t('taskDetail.submission.method')"><Input :id="id" v-model="submissionDraft.method" size="sm" maxlength="500" @change="commitSubmission" /></Field>
              <Field v-slot="{ id }" :label="t('taskDetail.submission.platform')"><Input :id="id" v-model="submissionDraft.platform" size="sm" maxlength="200" @change="commitSubmission" /></Field>
              <Field v-slot="{ id, invalid }" :label="t('taskDetail.submission.url')">
                <Input :id="id" v-model="submissionDraft.url" type="url" size="sm" :invalid="invalid" maxlength="2048" @change="commitSubmission" />
              </Field>
              <Field v-slot="{ id }" :label="t('taskDetail.submission.destination')"><Input :id="id" v-model="submissionDraft.destination" size="sm" maxlength="500" @change="commitSubmission" /></Field>
              <Field v-slot="{ id }" :label="t('taskDetail.submission.fileFormats')" :hint="t('taskDetail.submission.fileFormatsHint')">
                <Input :id="id" v-model="submissionDraft.fileFormats" size="sm" maxlength="400" @change="commitSubmission" />
              </Field>
              <Field v-slot="{ id }" :label="t('taskDetail.submission.naming')"><Input :id="id" v-model="submissionDraft.naming" size="sm" maxlength="500" @change="commitSubmission" /></Field>
              <Field v-slot="{ id }" :label="t('taskDetail.submission.sizeLimit')"><Input :id="id" v-model="submissionDraft.sizeLimit" size="sm" maxlength="100" @change="commitSubmission" /></Field>
              <Field v-slot="{ id }" :label="t('taskDetail.submission.copies')"><Input :id="id" v-model="submissionDraft.copies" size="sm" maxlength="100" @change="commitSubmission" /></Field>
              <Field v-slot="{ id }" :label="t('taskDetail.submission.conditions')" class="sm:col-span-2">
                <Input :id="id" v-model="submissionDraft.conditions" size="sm" maxlength="1000" @change="commitSubmission" />
              </Field>
            </div>
          </DetailSection>

          <!-- Reminders -->
          <DetailSection v-if="shown('reminders')" :title="t('taskDetail.sections.reminders.title')" :count="task.reminders.length || null">
            <ReminderEditor :reminders="task.reminders" :target="{ taskId: task.id }" :has-due="hasDue" />
          </DetailSection>

          <!-- Attachments -->
          <DetailSection v-if="shown('attachments')" :title="t('taskDetail.sections.attachments.title')" :count="task.attachments.length || null">
            <div class="flex flex-col gap-3">
              <ul v-if="task.attachments.length" class="flex flex-col gap-1" role="list">
                <li v-for="a in task.attachments" :key="a.id" class="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-hover">
                  <Paperclip class="size-3.5 shrink-0 text-subtle" aria-hidden="true" />
                  <a :href="`/api/v1/attachments/${a.id}`" download class="min-w-0 flex-1 truncate text-sm text-primary-text hover:underline" :aria-label="t('taskDetail.attachments.download', { name: a.filename })">{{ a.filename }}</a>
                  <span class="tabular shrink-0 text-xs text-subtle">{{ sizeLabel(a.size) }}</span>
                  <IconButton :label="t('taskDetail.attachments.remove', { name: a.filename })" size="sm" :disabled="saving" @click="removeAttachment(a)"><Trash2 aria-hidden="true" /></IconButton>
                </li>
              </ul>
              <p v-else class="text-xs text-subtle">{{ t('taskDetail.sections.attachments.empty') }}</p>
              <div>
                <input ref="fileInput" type="file" class="sr-only" tabindex="-1" :aria-label="t('taskDetail.attachments.upload')" @change="onFile" />
                <Button variant="soft" size="sm" :loading="uploading" @click="fileInput?.click()"><Paperclip class="size-4" aria-hidden="true" />{{ uploading ? t('taskDetail.attachments.uploading') : t('taskDetail.attachments.upload') }}</Button>
              </div>
            </div>
          </DetailSection>

          <!-- Notes -->
          <DetailSection v-if="shown('notes')" :title="t('taskDetail.sections.notes.title')">
            <Textarea v-model="notesDraft" rows="3" :placeholder="t('taskDetail.sections.notes.placeholder')" :aria-label="t('taskDetail.sections.notes.title')" @change="commitNotes" />
          </DetailSection>

          <!-- Source -->
          <DetailSection v-if="shown('source') && task.source" :title="t('taskDetail.sections.source.title')">
            <div class="flex flex-col gap-1.5 text-sm">
              <RouterLink :to="`/sources/${task.source.id}`" class="inline-flex items-center gap-1.5 font-medium text-primary-text hover:underline">
                <FileText class="size-3.5" aria-hidden="true" />{{ task.source.title || t('common.untitled') }}
              </RouterLink>
              <p v-if="task.source.sourceDate" class="text-xs text-muted">{{ t('taskDetail.source.date') }}: {{ f.date(task.source.sourceDate) }}</p>
              <a v-if="task.source.url" :href="task.source.url" target="_blank" rel="noopener noreferrer" class="inline-flex w-fit items-center gap-1 text-xs text-muted hover:text-fg">
                <ExternalLink class="size-3.5" aria-hidden="true" />{{ t('taskDetail.source.open') }}
              </a>
            </div>
          </DetailSection>
        </div>

        <!-- Add sections that are currently hidden -->
        <div v-if="hiddenSections.length" class="mt-6 flex justify-start">
          <Menu :items="hiddenSections.map((k) => ({ label: t(`taskDetail.sections.${k}.title`), icon: Plus, onSelect: () => (revealed[k] = true) }))" align="start" width="220px">
            <Button variant="ghost" size="sm"><Plus class="size-4" aria-hidden="true" />{{ t('taskDetail.addSection') }}</Button>
          </Menu>
        </div>

        <!-- History -->
        <section class="mt-8 border-t border-border pt-5" :aria-labelledby="'task-history-title'">
          <div class="flex items-center gap-2">
            <History class="size-4 text-subtle" aria-hidden="true" />
            <h3 id="task-history-title" class="text-[13px] font-semibold text-fg">{{ t('taskDetail.sections.history.title') }}</h3>
          </div>
          <ol v-if="historyShown.length" class="relative ml-2 mt-4 flex flex-col gap-3 border-l border-border pl-5">
            <li v-for="h in historyShown" :key="h.id" class="relative text-[13px]">
              <span class="absolute -left-[27px] top-0.5 grid size-5 place-items-center rounded-full bg-surface-sunken text-muted ring-4 ring-surface-raised" aria-hidden="true">
                <component :is="historyIcons[h.action] ?? History" class="size-3" />
              </span>
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span class="font-medium text-fg">{{ actionLabel(h.action) }}</span>
                <Badge v-if="h.actor === 'ai_confirmed'" tone="ai">{{ t('history.actor.ai_confirmed') }}</Badge>
                <time class="text-xs text-subtle" :datetime="new Date(h.createdAt).toISOString()" :title="f.dateTime(h.createdAt)">{{ f.relativeTime(h.createdAt, now) }}</time>
              </div>
            </li>
          </ol>
          <p v-else class="mt-3 text-xs text-subtle">{{ t('taskDetail.sections.history.empty') }}</p>
          <div v-if="historySorted.length > 8" class="mt-3">
            <Button variant="ghost" size="xs" @click="showAllHistory = !showAllHistory">{{ showAllHistory ? t('common.hide') : t('taskDetail.sections.history.showAll') }}</Button>
          </div>
        </section>

      </div>
    </template>
  </div>
</template>
