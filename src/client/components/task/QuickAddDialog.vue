<script setup lang="ts">
import { computed, reactive, ref, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronDown, CircleDot, Flag } from 'lucide-vue-next'
import Dialog from '@/components/ui/Dialog.vue'
import Button from '@/components/ui/Button.vue'
import Field from '@/components/ui/Field.vue'
import Input from '@/components/ui/Input.vue'
import Segmented from '@/components/ui/Segmented.vue'
import Select from '@/components/ui/Select.vue'
import Textarea from '@/components/ui/Textarea.vue'
import DueEditor from './DueEditor.vue'
import { useProjects, useTaskActions, useErrorMessage } from '@/composables/useTasks'
import { useFormat } from '@/composables/useFormat'
import { useToast } from '@/composables/useToast'
import { useUiStore } from '@/stores/ui'
import { useSessionStore } from '@/stores/session'
import { taskCreateSchema, type DueSpec } from '@shared/schemas'
import { PRIORITIES, REMINDER_PRESETS } from '@shared/constants'

/** Create a task or deadline. Opened from ui.openQuickAdd(preset); validated with the shared zod schema. */
const ui = useUiStore()
const session = useSessionStore()
const f = useFormat()
const toast = useToast()
const errMsg = useErrorMessage()
const actions = useTaskActions()
const { data: projects } = useProjects()
const { t, te, locale } = useI18n()

const preset: NonNullable<typeof ui.quickAddPreset> = ui.quickAddPreset ?? {}
const titleId = 'quick-add-title'

const kind = ref<'task' | 'deadline'>(preset.kind ?? 'task')
const title = ref('')
const description = ref('')
const showDetails = ref(false)
const priority = ref<(typeof PRIORITIES)[number]>(session.settings?.defaultPriority ?? 'none')
const projectId = ref<string>(preset.projectId ?? '')
const reminders = ref<number[]>([...(session.settings?.defaultReminderOffsets ?? [])])
const submitting = ref(false)
const errors = reactive<Record<string, string>>({})

function initialDue(): DueSpec {
  if (preset.dueDate) return { precision: 'date', date: preset.dueDate, time: null, timeZone: null }
  if (kind.value === 'deadline') return { precision: 'exact', date: null, time: null, timeZone: f.tz.value }
  return { precision: 'unknown' }
}
const due = ref<DueSpec>(initialDue())
const hasDue = computed(() => due.value.precision !== 'unknown')

// A deadline is always exact-capable; switching to deadline never pre-fills a time.
watch(kind, (k) => {
  if (k === 'deadline' && due.value.precision === 'unknown') due.value = { precision: 'exact', date: null, time: null, timeZone: f.tz.value }
})

const kindOptions = computed(() => [
  { value: 'task' as const, label: t('quickAdd.kinds.task'), icon: CircleDot },
  { value: 'deadline' as const, label: t('quickAdd.kinds.deadline'), icon: Flag },
])
const priorityOptions = computed(() => PRIORITIES.map((p) => ({ value: p, label: t(`priority.${p}`) })))
const projectOptions = computed(() => [
  { value: '', label: t('quickAdd.noProject') },
  ...(projects.value ?? []).filter((p) => p.status === 'active' || p.id === projectId.value).map((p) => ({ value: p.id, label: p.name })),
])

const dueErrors = computed(() => {
  const out: Partial<Record<'date' | 'time' | 'timeZone', string>> = {}
  if (errors['due.date']) out.date = errors['due.date']
  if (errors['due.time']) out.time = errors['due.time']
  if (errors['due.timeZone']) out.timeZone = errors['due.timeZone']
  return out
})
const dueGeneralError = computed(() => errors.due ?? '')

// ---- Reminders ----------------------------------------------------------------
const chipMinutes = computed(() => [...new Set<number>([...REMINDER_PRESETS.map((p) => p.minutes), ...reminders.value])].sort((a, b) => b - a))
function offsetLabel(m: number): string {
  const p = REMINDER_PRESETS.find((x) => x.minutes === m)
  if (p) return t(`reminders.presets.${p.key}`)
  const unit = m % 1440 === 0 ? 'day' : m % 60 === 0 ? 'hour' : 'minute'
  const value = unit === 'day' ? m / 1440 : unit === 'hour' ? m / 60 : m
  const when = new Intl.NumberFormat(locale.value === 'ja' ? 'ja-JP' : 'en-US', { style: 'unit', unit, unitDisplay: 'long' }).format(value)
  return t('reminders.before', { when })
}
function toggleReminder(m: number) {
  reminders.value = reminders.value.includes(m) ? reminders.value.filter((x) => x !== m) : [...reminders.value, m].sort((a, b) => b - a)
}

// ---- Options ------------------------------------------------------------------
function msg(code: string): string {
  const key = `quickAdd.errors.${code}`
  return te(key) ? t(key) : t('quickAdd.errors.generic')
}

function validate() {
  for (const k of Object.keys(errors)) delete errors[k]
  if (kind.value === 'deadline' && !hasDue.value) errors.due = msg('deadlineNeedsDue')
  const result = taskCreateSchema.safeParse({
    kind: kind.value,
    title: title.value.trim(),
    description: description.value.trim() || null,
    priority: priority.value,
    projectId: projectId.value || null,
    goalId: preset.goalId ?? null,
    parentId: preset.parentId ?? null,
    scheduledDate: preset.scheduledDate ?? null,
    due: due.value,
    reminderOffsets: hasDue.value ? [...reminders.value] : undefined,
  })
  if (!result.success) {
    for (const issue of result.error.issues) {
      const path = issue.path.map(String).join('.')
      const known = path === 'title' || path === 'due' || path.startsWith('due.')
      const key = known ? path : 'form'
      if (!errors[key]) errors[key] = msg(issue.message)
    }
  }
  return result.success && !Object.keys(errors).length ? result.data : null
}

async function submit() {
  if (submitting.value) return
  const data = validate()
  if (!data) {
    const firstErr = document.querySelector<HTMLElement>('[aria-invalid="true"]')
    firstErr?.focus()
    return
  }
  submitting.value = true
  try {
    const created = await actions.create(data)
    ui.quickAddOpen = false
    toast.success(t('quickAdd.created', { title: created.title }), { action: { label: t('quickAdd.open'), run: () => ui.openTask(created.id) } })
  } catch (e) {
    toast.error(errMsg(e))
  } finally {
    submitting.value = false
  }
}

function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    void submit()
  }
}
function onTitleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.isComposing) {
    e.preventDefault()
    void submit()
  }
}

onMounted(() => {
  // Reka focuses the close button first; move focus to the title shortly after open.
  setTimeout(() => document.getElementById(titleId)?.focus(), 60)
})
</script>

<template>
  <Dialog v-model:open="ui.quickAddOpen" :title="t('quickAdd.title')" :description="t('quickAdd.description')" size="md">
    <div class="flex flex-col gap-4" @keydown="onKeydown">
      <Field v-slot="{ id, describedby, invalid }" :id="titleId" :label="t('quickAdd.titleLabel')" :error="errors.title ?? null">
        <Input
          :id="id"
          v-model="title"
          class="h-10 text-[15px]"
          :invalid="invalid"
          :aria-describedby="describedby"
          :placeholder="t('quickAdd.titlePlaceholder')"
          maxlength="300"
          autocomplete="off"
          @keydown="onTitleKeydown"
        />
      </Field>

      <div class="flex flex-col gap-1.5">
        <Segmented v-model="kind" :options="kindOptions" :label="t('quickAdd.kindLabel')" class="w-full [&>button]:flex-1" />
      </div>

      <div class="flex flex-col gap-1.5">
        <span class="text-[13px] font-medium text-fg">{{ t('quickAdd.due') }}</span>
        <DueEditor v-model="due" :errors="dueErrors" />
        <p v-if="dueGeneralError" class="text-xs text-danger-text" role="alert">{{ dueGeneralError }}</p>
        <p v-else class="text-xs text-subtle">{{ kind === 'deadline' ? t('quickAdd.dueHintDeadline') : t('quickAdd.dueHintTask') }}</p>
      </div>
      <p v-if="errors.form" class="text-xs text-danger-text" role="alert">{{ errors.form }}</p>

      <div class="grid gap-4 sm:grid-cols-2">
        <Field v-slot="{ id }" :label="t('quickAdd.priority')">
          <Select :id="id" v-model="priority" :options="priorityOptions" />
        </Field>
        <Field v-slot="{ id }" :label="t('quickAdd.project')">
          <Select :id="id" v-model="projectId" :options="projectOptions" />
        </Field>
      </div>

      <div v-if="hasDue" class="flex flex-col gap-2">
        <span class="text-[13px] font-medium text-fg">{{ t('quickAdd.reminders') }}</span>
        <div class="flex flex-wrap gap-1.5" role="group" :aria-label="t('quickAdd.reminders')">
          <button
            v-for="m in chipMinutes"
            :key="m"
            type="button"
            :aria-pressed="reminders.includes(m)"
            class="tabular h-7 rounded-full border px-2.5 text-xs font-medium transition"
            :class="reminders.includes(m) ? 'border-primary bg-primary-softer text-primary-text' : 'border-border bg-surface text-muted hover:text-fg'"
            @click="toggleReminder(m)"
          >
            {{ offsetLabel(m) }}
          </button>
        </div>
        <p class="text-xs text-subtle">{{ t('quickAdd.remindersHint') }}</p>
      </div>
      <p v-else class="text-xs text-subtle">{{ t('quickAdd.remindersNeedDue') }}</p>

      <div class="flex flex-col gap-3">
        <button type="button" class="inline-flex w-fit items-center gap-1 rounded-md text-[13px] font-medium text-primary-text outline-none focus-visible:ring-3 focus-visible:ring-[var(--focus-ring)]" :aria-expanded="showDetails" @click="showDetails = !showDetails">
          <ChevronDown class="size-4 transition-transform duration-200" :class="showDetails && 'rotate-180'" aria-hidden="true" />
          {{ showDetails ? t('quickAdd.hideDetails') : t('quickAdd.addDetails') }}
        </button>
        <Transition name="fade">
          <Field v-if="showDetails" v-slot="{ id }" :label="t('quickAdd.descriptionLabel')">
            <Textarea :id="id" v-model="description" rows="3" :placeholder="t('quickAdd.descriptionPlaceholder')" />
          </Field>
        </Transition>
      </div>
    </div>

    <template #footer>
      <p class="mr-auto hidden text-xs text-subtle sm:block">{{ t('quickAdd.shortcut') }}</p>
      <Button variant="ghost" @click="ui.quickAddOpen = false">{{ t('common.cancel') }}</Button>
      <Button variant="primary" :loading="submitting" @click="submit">{{ t('quickAdd.submit') }}</Button>
    </template>
  </Dialog>
</template>
