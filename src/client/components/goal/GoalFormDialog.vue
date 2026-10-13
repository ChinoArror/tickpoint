<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import Dialog from '@/components/ui/Dialog.vue'
import Button from '@/components/ui/Button.vue'
import Field from '@/components/ui/Field.vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Select from '@/components/ui/Select.vue'
import { api } from '@/lib/api'
import { useErrorMessage, useProjects } from '@/composables/useTasks'
import { useToast } from '@/composables/useToast'
import { goalCreateSchema } from '@shared/schemas'
import { GOAL_PROGRESS_MODELS, REVIEW_FREQUENCIES, type GoalProgressModel, type ReviewFrequency } from '@shared/constants'
import { useGoalFormat, type GoalPrefill } from './goalFormat'
import type { Goal, GoalDetail } from '@/lib/types'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ goal?: Goal | null; prefill?: GoalPrefill | null }>()

const { t } = useI18n()
const router = useRouter()
const qc = useQueryClient()
const toast = useToast()
const errMsg = useErrorMessage()
const gf = useGoalFormat()
const { data: projects } = useProjects()

const isEdit = computed(() => !!props.goal)
const saving = ref(false)
const errors = ref<Record<string, string>>({})

interface FormState {
  title: string
  description: string
  projectId: string | null
  progressModel: GoalProgressModel
  currentValue: string | number | null
  targetValue: string | number | null
  unit: string
  targetDate: string
  weeklyHours: string | number | null
  estimatedHours: string | number | null
  reviewFrequency: ReviewFrequency
  successCriteria: string
}

function blank(): FormState {
  return {
    title: '',
    description: '',
    projectId: null,
    progressModel: 'percentage',
    currentValue: 0,
    targetValue: null,
    unit: '',
    targetDate: '',
    weeklyHours: null,
    estimatedHours: null,
    reviewFrequency: 'weekly',
    successCriteria: '',
  }
}

const form = ref<FormState>(blank())

const minutesToHours = (m: number | null | undefined) => (m == null ? null : Math.round((m / 60) * 100) / 100)

function populate() {
  errors.value = {}
  const g = props.goal
  if (g) {
    form.value = {
      title: g.title,
      description: g.description ?? '',
      projectId: g.projectId,
      progressModel: g.progressModel,
      currentValue: g.currentValue,
      targetValue: g.targetValue,
      unit: g.unit ?? '',
      targetDate: g.targetDate ?? '',
      weeklyHours: minutesToHours(g.weeklyEffortMinutes),
      estimatedHours: minutesToHours(g.estimatedMinutes),
      reviewFrequency: g.reviewFrequency,
      successCriteria: g.successCriteria ?? '',
    }
    return
  }
  const p = props.prefill
  form.value = {
    ...blank(),
    title: p?.title ?? '',
    progressModel: p?.progressModel ?? 'percentage',
    targetValue: p?.targetValue ?? null,
    unit: p?.unit ?? '',
    projectId: p?.projectId ?? null,
  }
}

watch(open, (v) => {
  if (v) populate()
})

const modelOptions = computed(() => GOAL_PROGRESS_MODELS.map((m) => ({ value: m, label: gf.modelLabel(m) })))
const reviewOptions = computed(() => REVIEW_FREQUENCIES.map((r) => ({ value: r, label: gf.reviewLabel(r) })))
const projectOptions = computed(() => [
  { value: null as string | null, label: t('goalForm.noProject') },
  ...(projects.value ?? [])
    .filter((p) => p.status === 'active' || p.id === form.value.projectId)
    .map((p) => ({ value: p.id as string | null, label: p.name })),
])

const model = computed(() => form.value.progressModel)
const showTarget = computed(() => model.value === 'quantity' || model.value === 'time')
const showCurrent = computed(() => model.value === 'quantity' || model.value === 'time' || model.value === 'percentage')

/** Empty input -> null; non-numeric input -> NaN (reported as invalid). */
function toNumber(v: string | number | null): number | null {
  if (v == null || v === '') return null
  return Number(v)
}
function hoursToMinutes(h: string | number | null): number | null {
  const n = toNumber(h)
  return n == null || Number.isNaN(n) ? null : Math.round(n * 60)
}

const FIELD_FOR_PATH: Record<string, string> = { weeklyEffortMinutes: 'weeklyHours', estimatedMinutes: 'estimatedHours' }

function buildPayload() {
  const m = form.value.progressModel
  return {
    title: form.value.title.trim(),
    description: form.value.description.trim() || null,
    projectId: form.value.projectId || null,
    targetDate: form.value.targetDate || null,
    progressModel: m,
    currentValue: toNumber(form.value.currentValue) ?? 0,
    targetValue: m === 'quantity' || m === 'time' ? toNumber(form.value.targetValue) : null,
    unit: m === 'quantity' ? form.value.unit.trim() || null : m === 'time' ? 'h' : null,
    weeklyEffortMinutes: hoursToMinutes(form.value.weeklyHours),
    reviewFrequency: form.value.reviewFrequency,
    successCriteria: form.value.successCriteria.trim() || null,
    estimatedMinutes: hoursToMinutes(form.value.estimatedHours),
    status: props.goal?.status ?? 'active',
  }
}

function validate(payload: ReturnType<typeof buildPayload>) {
  const next: Record<string, string> = {}
  for (const [field, value] of [
    ['targetValue', form.value.targetValue],
    ['currentValue', form.value.currentValue],
    ['weeklyHours', form.value.weeklyHours],
    ['estimatedHours', form.value.estimatedHours],
  ] as const) {
    const n = toNumber(value)
    if (n !== null && Number.isNaN(n)) next[field] = t('goalForm.errors.INVALID')
  }
  const parsed = goalCreateSchema.safeParse(payload)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = String(issue.path[0] ?? 'title')
      const key = FIELD_FOR_PATH[path] ?? path
      if (next[key]) continue
      const code = issue.message === 'REQUIRED' || issue.message === 'OUT_OF_RANGE' ? issue.message : 'INVALID'
      next[key] = t(`goalForm.errors.${code}`)
    }
  }
  errors.value = next
  return Object.keys(next).length === 0 && parsed.success ? parsed.data : null
}

function invalidate() {
  for (const key of ['goals', 'goal', 'dashboard']) qc.invalidateQueries({ queryKey: [key] })
}

async function submit() {
  if (saving.value) return
  const data = validate(buildPayload())
  if (!data) return
  saving.value = true
  try {
    if (props.goal) {
      await api.patch<GoalDetail>(`/goals/${props.goal.id}`, data)
      invalidate()
      toast.success(t('toast.saved'))
      open.value = false
    } else {
      const created = await api.post<GoalDetail>('/goals', data)
      invalidate()
      open.value = false
      router.push(`/goals/${created.id}`)
    }
  } catch (e) {
    toast.error(errMsg(e))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog
    v-model:open="open"
    :title="isEdit ? t('goalForm.editTitle') : t('goalForm.createTitle')"
    :description="t('goalForm.description')"
    size="lg"
  >
    <form id="goal-form" class="flex flex-col gap-4" novalidate @submit.prevent="submit">
      <Field :label="t('goalForm.title')" :error="errors.title" v-slot="{ id, describedby, invalid }">
        <Input
          :id="id"
          v-model="form.title"
          :aria-describedby="describedby"
          :invalid="invalid"
          :placeholder="t('goalForm.titlePlaceholder')"
          maxlength="300"
          autocomplete="off"
        />
      </Field>

      <Field :label="t('goalForm.descriptionLabel')" :error="errors.description" optional :optional-label="t('common.optional')" v-slot="{ id, describedby, invalid }">
        <Textarea :id="id" v-model="form.description" :aria-describedby="describedby" :invalid="invalid" rows="2" />
      </Field>

      <Field :label="t('goalForm.progressModel')" :hint="gf.modelHint(form.progressModel)" :error="errors.progressModel" v-slot="{ id, describedby, invalid }">
        <Select :id="id" v-model="form.progressModel" :aria-describedby="describedby" :invalid="invalid" :options="modelOptions" />
      </Field>

      <div v-if="showTarget" class="grid gap-4 sm:grid-cols-2">
        <Field :label="model === 'time' ? t('goalForm.targetHours') : t('goalForm.targetQuantity')" :error="errors.targetValue" v-slot="{ id, describedby, invalid }">
          <Input :id="id" v-model="form.targetValue" type="number" min="0" step="any" :aria-describedby="describedby" :invalid="invalid" />
        </Field>
        <Field v-if="model === 'quantity'" :label="t('goalForm.unit')" :error="errors.unit" optional :optional-label="t('common.optional')" v-slot="{ id, describedby, invalid }">
          <Input :id="id" v-model="form.unit" :aria-describedby="describedby" :invalid="invalid" :placeholder="t('goalForm.unitPlaceholder')" maxlength="40" />
        </Field>
        <Field v-else :label="t('goalForm.unit')" :hint="t('goalForm.unitFixedHint')">
          <Input :model-value="t('goalForm.unitHours')" disabled readonly />
        </Field>
      </div>

      <Field
        v-if="showCurrent"
        :label="model === 'percentage' ? t('goalForm.currentPercent') : t('goalForm.currentValue')"
        :hint="model === 'percentage' ? t('goalForm.percentHint') : undefined"
        :error="errors.currentValue"
        v-slot="{ id, describedby, invalid }"
      >
        <Input
          :id="id"
          v-model="form.currentValue"
          type="number"
          min="0"
          :max="model === 'percentage' ? 100 : undefined"
          step="any"
          :aria-describedby="describedby"
          :invalid="invalid"
        />
      </Field>

      <Field :label="t('goalForm.targetDate')" :hint="t('goalForm.targetDateHint')" :error="errors.targetDate" v-slot="{ id, describedby, invalid }">
        <div class="flex items-center gap-2">
          <Input :id="id" v-model="form.targetDate" type="date" :aria-describedby="describedby" :invalid="invalid" class="max-w-52" />
          <Button v-if="form.targetDate" variant="ghost" size="sm" @click="form.targetDate = ''">{{ t('goalForm.clearDate') }}</Button>
        </div>
      </Field>

      <div class="grid gap-4 sm:grid-cols-2">
        <Field :label="t('goalForm.weeklyEffort')" :error="errors.weeklyHours" optional :optional-label="t('common.optional')" v-slot="{ id, describedby, invalid }">
          <Input :id="id" v-model="form.weeklyHours" type="number" min="0" max="168" step="0.5" :aria-describedby="describedby" :invalid="invalid" />
        </Field>
        <Field :label="t('goalForm.estimatedEffort')" :error="errors.estimatedHours" optional :optional-label="t('common.optional')" v-slot="{ id, describedby, invalid }">
          <Input :id="id" v-model="form.estimatedHours" type="number" min="0" step="0.5" :aria-describedby="describedby" :invalid="invalid" />
        </Field>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <Field :label="t('goalForm.reviewFrequency')" :error="errors.reviewFrequency" v-slot="{ id, describedby, invalid }">
          <Select :id="id" v-model="form.reviewFrequency" :aria-describedby="describedby" :invalid="invalid" :options="reviewOptions" />
        </Field>
        <Field :label="t('goalForm.project')" :error="errors.projectId" v-slot="{ id, describedby, invalid }">
          <Select :id="id" v-model="form.projectId" :aria-describedby="describedby" :invalid="invalid" :options="projectOptions" />
        </Field>
      </div>

      <Field :label="t('goalForm.successCriteria')" :error="errors.successCriteria" optional :optional-label="t('common.optional')" v-slot="{ id, describedby, invalid }">
        <Textarea :id="id" v-model="form.successCriteria" :aria-describedby="describedby" :invalid="invalid" rows="2" :placeholder="t('goalForm.successCriteriaPlaceholder')" />
      </Field>
    </form>

    <template #footer>
      <Button variant="secondary" @click="open = false">{{ t('common.cancel') }}</Button>
      <Button type="submit" form="goal-form" variant="primary" :loading="saving">{{ isEdit ? t('common.save') : t('common.create') }}</Button>
    </template>
  </Dialog>
</template>
