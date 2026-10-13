<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { CalendarDays, CalendarOff, Clock, Waves } from 'lucide-vue-next'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import { useFormat } from '@/composables/useFormat'
import { zonedTimeToUtc } from '@shared/time'
import type { DueSpec } from '@shared/schemas'

/**
 * Edits a due specification without ever inventing a time:
 * - "Date only" stores just the date.
 * - "Date & time" requires an explicit time and IANA time zone.
 */
const model = defineModel<DueSpec | null>({ default: null })
defineProps<{ errors?: Partial<Record<'date' | 'time' | 'timeZone', string>> }>()
const { t } = useI18n()
const f = useFormat()
const uid = useId()

const precision = computed({
  get: () => model.value?.precision ?? 'unknown',
  set: (p: DueSpec['precision']) => {
    const cur = model.value
    if (p === 'unknown') model.value = { precision: 'unknown' }
    else if (p === 'exact') model.value = { precision: 'exact', date: cur?.date ?? null, time: cur?.time ?? null, timeZone: cur?.timeZone ?? f.tz.value }
    else model.value = { precision: p, date: cur?.date ?? null, time: null, timeZone: cur?.timeZone ?? null }
  },
})

function patch(p: Partial<DueSpec>) {
  model.value = { ...(model.value ?? { precision: 'unknown' }), ...p } as DueSpec
}

const options = computed(() => [
  { value: 'unknown' as const, label: t('due.precision.unknown'), icon: CalendarOff },
  { value: 'date' as const, label: t('due.precision.date'), icon: CalendarDays },
  { value: 'exact' as const, label: t('due.precision.exact'), icon: Clock },
  { value: 'approximate' as const, label: t('due.precision.approximate'), icon: Waves },
])

const zones = computed(() => {
  const common = ['UTC', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Taipei', 'Asia/Seoul', 'Asia/Singapore', 'Asia/Kolkata', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Australia/Sydney']
  const set = new Set([f.tz.value, ...(model.value?.timeZone ? [model.value.timeZone] : []), ...common])
  const list = [...set].map((z) => ({ value: z, label: z.replace(/_/g, ' ') }))
  // A missing zone stays visibly missing: never display the user's zone in its place.
  return model.value?.timeZone ? list : [{ value: '', label: t('dueEditor.chooseZone'), disabled: true }, ...list]
})

/** Arrow-key navigation within the precision radio group. */
function onPrecisionKey(e: KeyboardEvent) {
  const keys = options.value.map((o) => o.value)
  const i = keys.indexOf(precision.value)
  let next: number | null = null
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % keys.length
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + keys.length) % keys.length
  if (next == null) return
  e.preventDefault()
  precision.value = keys[next]
  ;(e.currentTarget as HTMLElement).querySelector<HTMLElement>('[data-value="' + keys[next] + '"]')?.focus()
}

// Preview the exact instant in the user's own zone when the source zone differs.
const preview = computed(() => {
  const m = model.value
  if (!m || m.precision !== 'exact' || !m.date || !m.time || !m.timeZone || m.timeZone === f.tz.value) return null
  try {
    return f.dateTime(zonedTimeToUtc(m.date, m.time, m.timeZone))
  } catch {
    return null
  }
})
</script>

<template>
  <!-- Container-responsive: adapts to the column it is placed in, not the viewport. -->
  <div class="@container flex flex-col gap-2.5">
    <div role="radiogroup" :aria-label="t('dueEditor.precisionLabel')" class="grid grid-cols-2 gap-1 rounded-[10px] bg-surface-sunken p-1 @md:grid-cols-4" @keydown="onPrecisionKey">
      <button
        v-for="o in options"
        :key="o.value"
        type="button"
        role="radio"
        :aria-checked="precision === o.value"
        :tabindex="precision === o.value ? 0 : -1"
        :data-value="o.value"
        class="flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-[background-color,color,box-shadow] duration-200"
        :class="precision === o.value ? 'bg-surface text-fg shadow-sm ring-1 ring-border' : 'text-muted hover:text-fg'"
        @click="precision = o.value"
      >
        <component :is="o.icon" class="size-3.5 shrink-0" aria-hidden="true" />
        <span class="truncate">{{ o.label }}</span>
      </button>
    </div>
    <Transition name="fade" mode="out-in">
      <div v-if="precision !== 'unknown'" :key="precision === 'exact' ? 'exact' : 'date'" class="grid gap-2" :class="precision === 'exact' ? 'grid-cols-2 @lg:grid-cols-[1fr_7.5rem_1.3fr]' : ''">
        <div class="min-w-0">
          <label :for="`${uid}-date`" class="sr-only">{{ t('dueEditor.date') }}</label>
          <Input :id="`${uid}-date`" type="date" :model-value="model?.date ?? ''" :invalid="!!errors?.date" @update:model-value="(v) => patch({ date: (v as string) || null })" />
        </div>
        <template v-if="precision === 'exact'">
          <div class="min-w-0">
            <label :for="`${uid}-time`" class="sr-only">{{ t('dueEditor.time') }}</label>
            <Input :id="`${uid}-time`" type="time" :model-value="model?.time ?? ''" :invalid="!!errors?.time" @update:model-value="(v) => patch({ time: (v as string) || null })" />
          </div>
          <div class="col-span-2 min-w-0 @lg:col-span-1">
            <label :for="`${uid}-tz`" class="sr-only">{{ t('dueEditor.timeZone') }}</label>
            <Select :id="`${uid}-tz`" :model-value="model?.timeZone ?? ''" :options="zones" :invalid="!!errors?.timeZone" @update:model-value="(v) => patch({ timeZone: v as string })" />
          </div>
        </template>
      </div>
    </Transition>
    <p v-if="precision === 'exact' && !model?.time" class="text-xs text-warning-text">{{ t('dueEditor.timeRequired') }}</p>
    <p v-else-if="preview" class="text-xs text-muted">{{ t('dueEditor.localPreview', { time: preview }) }}</p>
    <p v-else-if="precision === 'date'" class="text-xs text-subtle">{{ t('dueEditor.dateOnlyHint') }}</p>
    <p v-else-if="precision === 'approximate'" class="text-xs text-subtle">{{ t('dueEditor.approxHint') }}</p>
    <p v-for="(e, k) in errors" :key="k" class="text-xs text-danger-text" role="alert">{{ e }}</p>
  </div>
</template>
