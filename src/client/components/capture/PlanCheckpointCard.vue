<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { GripVertical, Trash2 } from 'lucide-vue-next'
import Badge from '@/components/ui/Badge.vue'
import Field from '@/components/ui/Field.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Textarea from '@/components/ui/Textarea.vue'
import { PRIORITIES, REMINDER_PRESETS } from '@shared/constants'
import type { DraftCheckpoint } from '@/lib/types'

/**
 * One editable draft checkpoint. Every user change marks the item as edited,
 * which protects it from silent overwrite on regeneration.
 */
type Priority = DraftCheckpoint['priority']

const props = defineProps<{
  cp: DraftCheckpoint
  index: number
  others: { clientId: string; title: string }[]
  selected: boolean
  flash: boolean
  conflict: boolean
}>()
const emit = defineEmits<{ select: [checked: boolean]; remove: [] }>()
const { t } = useI18n()

function edit(patch: Partial<DraftCheckpoint>) {
  Object.assign(props.cp, patch, { edited: true })
}

const priorityOptions = computed<{ value: Priority; label: string }[]>(() => PRIORITIES.map((p) => ({ value: p, label: t(`priority.${p}`) })))
const reminderOptions = computed<{ value: number | null; label: string }[]>(() => [
  { value: null, label: t('plan.card.noReminder') },
  ...REMINDER_PRESETS.map((p) => ({ value: p.minutes, label: t(`capture.review.options.presets.${p.key}`) })),
])

function toggleDep(id: string) {
  const list = props.cp.dependsOn
  const i = list.indexOf(id)
  edit({ dependsOn: i >= 0 ? list.filter((x) => x !== id) : [...list, id] })
}
</script>

<template>
  <article
    class="rounded-2xl border bg-surface p-4 shadow-xs transition-[border-color,box-shadow,background-color] duration-300"
    :class="[
      conflict ? 'border-danger/45 bg-danger-soft/25' : selected ? 'border-ai/50' : 'border-border',
      flash ? 'animate-pop ring-2 ring-ai/30' : '',
    ]"
  >
    <div class="flex items-start gap-2.5">
      <button
        type="button"
        class="drag-handle mt-0.5 grid size-8 shrink-0 cursor-grab place-items-center rounded-lg text-subtle transition-colors hover:bg-surface-hover hover:text-fg active:cursor-grabbing"
        :aria-label="t('plan.list.reorder', { n: index + 1 })"
      >
        <GripVertical class="size-4" aria-hidden="true" />
      </button>
      <span class="tabular mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-surface-sunken text-xs font-semibold text-muted">{{ index + 1 }}</span>

      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-1.5">
          <Badge :tone="cp.fromSourceRequirement ? 'primary' : 'neutral'">
            {{ cp.fromSourceRequirement ? t('plan.card.fromSource') : t('plan.card.suggestion') }}
          </Badge>
          <Badge v-if="cp.edited" tone="info">{{ t('plan.card.edited') }}</Badge>
        </div>
      </div>

      <label class="mt-1.5 flex shrink-0 cursor-pointer items-center">
        <input
          type="checkbox"
          class="size-4 accent-[var(--color-ai)]"
          :checked="selected"
          :aria-label="t('plan.list.select', { n: index + 1 })"
          @change="emit('select', ($event.target as HTMLInputElement).checked)"
        />
      </label>
      <IconButton :label="t('plan.list.remove', { n: index + 1 })" @click="emit('remove')"><Trash2 /></IconButton>
    </div>

    <div class="mt-3 grid min-w-0 gap-3 sm:pl-[60px] [&>*]:min-w-0">
      <Field v-slot="{ id, describedby, invalid }" :label="t('plan.card.title')">
        <Input
          :id="id"
          :model-value="cp.title"
          :aria-describedby="describedby"
          :invalid="invalid || !cp.title.trim()"
          :placeholder="t('plan.card.title')"
          @update:model-value="(v) => edit({ title: String(v ?? '') })"
        />
      </Field>
      <p v-if="!cp.title.trim()" class="-mt-2 text-xs text-warning-text">{{ t('plan.card.titleRequired') }}</p>

      <Field v-slot="{ id, describedby }" :label="t('plan.card.criteria')">
        <Textarea :id="id" rows="2" :model-value="cp.completionCriteria ?? ''" :aria-describedby="describedby" @update:model-value="(v) => edit({ completionCriteria: (v as string) || null })" />
      </Field>

      <div class="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-3 [&>*]:min-w-0">
        <Field v-slot="{ id, describedby }" :label="t('plan.card.start')" class="min-w-0">
          <Input :id="id" type="date" size="sm" :model-value="cp.startDate ?? ''" :aria-describedby="describedby" @update:model-value="(v) => edit({ startDate: (v as string) || null })" />
        </Field>
        <Field v-slot="{ id, describedby }" :label="t('plan.card.target')">
          <Input :id="id" type="date" size="sm" :model-value="cp.targetDate ?? ''" :aria-describedby="describedby" @update:model-value="(v) => edit({ targetDate: (v as string) || null })" />
        </Field>
        <Field v-slot="{ id, describedby }" :label="t('plan.card.minutes')">
          <Input
            :id="id"
            type="number"
            min="0"
            size="sm"
            :model-value="cp.estimatedMinutes ?? ''"
            :aria-describedby="describedby"
            @update:model-value="(v) => edit({ estimatedMinutes: v === '' || v == null ? null : Number(v) })"
          />
        </Field>
        <Field v-slot="{ id, describedby }" :label="t('plan.card.priority')">
          <Select :id="id" size="sm" :model-value="cp.priority" :options="priorityOptions" :aria-describedby="describedby" @update:model-value="(v) => edit({ priority: v as Priority })" />
        </Field>
        <Field v-slot="{ id, describedby }" :label="t('plan.card.reminder')" class="col-span-2 lg:col-span-2">
          <Select
            :id="id"
            size="sm"
            :model-value="cp.reminderOffsetMinutes ?? null"
            :options="reminderOptions"
            :aria-describedby="describedby"
            @update:model-value="(v) => edit({ reminderOffsetMinutes: v as number | null })"
          />
        </Field>
      </div>

      <div class="flex flex-col gap-1.5">
        <p class="text-[13px] font-medium text-fg">{{ t('plan.card.dependsOn') }}</p>
        <div v-if="others.length" class="flex flex-wrap gap-1.5">
          <button
            v-for="o in others"
            :key="o.clientId"
            type="button"
            :aria-pressed="cp.dependsOn.includes(o.clientId)"
            class="max-w-full truncate rounded-full border px-2.5 py-0.5 text-xs transition-colors"
            :class="cp.dependsOn.includes(o.clientId) ? 'border-primary bg-primary-soft text-primary-text' : 'border-border bg-surface text-muted hover:text-fg'"
            @click="toggleDep(o.clientId)"
          >
            {{ o.title || t('plan.card.title') }}
          </button>
        </div>
        <p v-else class="text-xs text-subtle">{{ t('plan.card.dependsOnEmpty') }}</p>
      </div>

      <p v-if="cp.reasoning" class="text-xs leading-relaxed text-muted">
        <span class="font-semibold text-ai">{{ t('ai.reasoning') }}</span>
        <span class="mx-1 text-subtle">·</span>{{ cp.reasoning }}
      </p>
    </div>
  </article>
</template>
