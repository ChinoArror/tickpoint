<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import Card from '@/components/ui/Card.vue'
import Button from '@/components/ui/Button.vue'
import Field from '@/components/ui/Field.vue'
import Input from '@/components/ui/Input.vue'
import Switch from '@/components/ui/Switch.vue'
import { api } from '@/lib/api'
import { useErrorMessage } from '@/composables/useTasks'
import { useToast } from '@/composables/useToast'
import { useGoalFormat } from './goalFormat'
import type { GoalDetail } from '@/lib/types'

const props = defineProps<{ goal: GoalDetail }>()
const { t } = useI18n()
const qc = useQueryClient()
const toast = useToast()
const errMsg = useErrorMessage()
const gf = useGoalFormat()

const model = computed(() => props.goal.progressModel)
const isAggregate = computed(() => model.value === 'checkpoint' || model.value === 'weighted')
const unitLabel = computed(() => (model.value === 'time' ? t('goalForm.unitHours') : props.goal.unit ?? ''))

const delta = ref<string>('')
const absolute = ref<string>('')
const percent = ref<number>(props.goal.currentValue)
const achieved = ref<boolean>(props.goal.currentValue >= 1)
const minutes = ref<string>('')
const note = ref('')
const error = ref<string | null>(null)
const emit = defineEmits<{ logged: [] }>()

// Keep the controls in sync with server state after each refresh.
watch(
  () => props.goal.currentValue,
  (v) => {
    percent.value = v
    achieved.value = v >= 1
  },
)

const canLog = computed(() => {
  switch (model.value) {
    case 'quantity':
    case 'time':
      return delta.value !== '' || absolute.value !== ''
    case 'percentage':
      return percent.value !== props.goal.currentValue
    case 'binary':
      return achieved.value !== props.goal.currentValue >= 1
    default:
      return minutes.value !== '' || note.value.trim() !== ''
  }
})

function parseNumber(v: string): number {
  return Number(v)
}

const mutation = useMutation({
  mutationFn: (body: Record<string, unknown>) => api.post('/progress', body),
  onSuccess: () => {
    for (const key of ['goal', 'goals', 'dashboard']) qc.invalidateQueries({ queryKey: [key] })
    toast.success(t('progressLog.logged'))
    delta.value = ''
    absolute.value = ''
    minutes.value = ''
    note.value = ''
    error.value = null
    emit('logged')
  },
  onError: (e) => toast.error(errMsg(e)),
})

function submit() {
  error.value = null
  const body: Record<string, unknown> = { goalId: props.goal.id }

  if (model.value === 'quantity' || model.value === 'time') {
    if (delta.value !== '' && absolute.value !== '') {
      error.value = t('progressLog.errors.valueOrDelta')
      return
    }
    if (delta.value !== '') body.delta = parseNumber(delta.value)
    if (absolute.value !== '') body.value = parseNumber(absolute.value)
    if (body.delta !== undefined && !Number.isFinite(body.delta)) return setInvalid()
    if (body.value !== undefined && !Number.isFinite(body.value)) return setInvalid()
  } else if (model.value === 'percentage') {
    body.value = percent.value
  } else if (model.value === 'binary') {
    body.value = achieved.value ? 1 : 0
  }

  if (minutes.value !== '') {
    const m = Math.round(parseNumber(minutes.value))
    if (!Number.isFinite(m) || m < 0) return setInvalid()
    body.minutes = m
  }
  if (note.value.trim()) body.note = note.value.trim()
  mutation.mutate(body)
}

function setInvalid() {
  error.value = t('progressLog.errors.invalid')
}
</script>

<template>
  <Card :title="t('progressLog.title')" class="h-full">
    <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
      <p class="text-sm text-muted">
        <span class="font-medium text-fg">{{ gf.progressText(goal) }}</span>
      </p>

      <!-- Quantity / time: relative add and optional absolute set -->
      <template v-if="model === 'quantity' || model === 'time'">
        <div class="grid gap-4 sm:grid-cols-2">
          <Field :label="t('progressLog.add')" :hint="t('progressLog.addHint')" v-slot="{ id, describedby, invalid }">
            <div class="flex items-center gap-2">
              <Input :id="id" v-model="delta" type="number" step="any" :placeholder="t('progressLog.addPlaceholder')" :aria-describedby="describedby" :invalid="invalid" />
              <span v-if="unitLabel" class="shrink-0 text-sm text-muted">{{ unitLabel }}</span>
            </div>
          </Field>
          <Field :label="t('progressLog.setTo')" :hint="t('progressLog.setToHint')" v-slot="{ id, describedby, invalid }">
            <div class="flex items-center gap-2">
              <Input :id="id" v-model="absolute" type="number" min="0" step="any" :placeholder="t('progressLog.setToPlaceholder')" :aria-describedby="describedby" :invalid="invalid" />
              <span v-if="unitLabel" class="shrink-0 text-sm text-muted">{{ unitLabel }}</span>
            </div>
          </Field>
        </div>
      </template>

      <!-- Percentage: slider -->
      <Field v-else-if="model === 'percentage'" :label="t('progressLog.percent')" v-slot="{ id, describedby }">
        <div class="flex items-center gap-3">
          <input
            :id="id"
            v-model.number="percent"
            type="range"
            min="0"
            max="100"
            step="1"
            :aria-describedby="describedby"
            class="h-2 w-full cursor-pointer accent-[var(--primary)]"
          />
          <span class="tabular w-12 text-right text-sm font-medium text-fg">{{ percent }}%</span>
        </div>
      </Field>

      <!-- Binary: toggle -->
      <div v-else-if="model === 'binary'" class="flex items-center justify-between gap-3">
        <span class="text-sm font-medium text-fg">{{ t('progressLog.markAchieved') }}</span>
        <Switch v-model="achieved" :label="t('progressLog.markAchieved')" />
      </div>

      <!-- Checkpoint / weighted: progress comes from checkpoints -->
      <p v-else-if="isAggregate" class="rounded-xl bg-surface-sunken px-3 py-2.5 text-sm text-muted">
        {{ t('progressLog.fromCheckpoints') }}
      </p>

      <div class="grid gap-4 sm:grid-cols-2">
        <Field :label="t('progressLog.minutes')" :optional="true" :optional-label="t('common.optional')" v-slot="{ id, describedby, invalid }">
          <Input :id="id" v-model="minutes" type="number" min="0" max="1440" step="1" :aria-describedby="describedby" :invalid="invalid" :placeholder="t('progressLog.minutesPlaceholder')" />
        </Field>
        <Field :label="t('progressLog.note')" :optional="true" :optional-label="t('common.optional')" v-slot="{ id, describedby, invalid }">
          <Input :id="id" v-model="note" maxlength="2000" :aria-describedby="describedby" :invalid="invalid" :placeholder="t('progressLog.notePlaceholder')" />
        </Field>
      </div>

      <p v-if="error" role="alert" class="text-xs text-danger-text">{{ error }}</p>

      <div class="flex justify-end">
        <Button type="submit" variant="primary" size="sm" :loading="mutation.isPending.value" :disabled="!canLog">
          {{ t('progressLog.submit') }}
        </Button>
      </div>
    </form>
  </Card>
</template>
