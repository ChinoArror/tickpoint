<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { AlertTriangle, Info, Trash2, Undo2 } from 'lucide-vue-next'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Field from '@/components/ui/Field.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import IconButton from '@/components/ui/IconButton.vue'
import DueEditor from '@/components/task/DueEditor.vue'
import EvidenceQuote from './EvidenceQuote.vue'
import { useFormat } from '@/composables/useFormat'
import type { CreateAs, DeadlineRow } from './reviewModel'

/** One extracted deadline. Its due value is edited in place through the DueEditor. */
const props = defineProps<{ row: DeadlineRow; primary: boolean; group: string }>()
const emit = defineEmits<{ makePrimary: []; remove: []; restore: []; focusEvidence: [key: string] }>()
const { t } = useI18n()
const f = useFormat()

const needsZone = computed(() => props.row.due?.precision === 'exact' && !props.row.due.timeZone)
const kindLabel = computed(() => props.row.kind.replace(/_/g, ' '))
const confidence = computed(() => (props.row.confidence == null ? null : t('ai.advisory', { value: f.percent(props.row.confidence) })))
const createAsOptions = computed<{ value: CreateAs; label: string }[]>(() => [
  { value: 'deadline', label: t('capture.review.deadlines.createAsOptions.deadline') },
  { value: 'checkpoint', label: t('capture.review.deadlines.createAsOptions.checkpoint') },
  { value: 'skip', label: t('capture.review.deadlines.createAsOptions.skip') },
])
</script>

<template>
  <li
    class="rounded-xl border p-3 transition-[background-color,border-color] duration-200"
    :class="[row.removed ? 'border-border bg-surface-sunken' : primary ? 'border-primary/40 bg-surface shadow-xs' : 'border-border bg-surface']"
  >
    <div v-if="row.removed" class="flex items-center justify-between gap-3">
      <p class="min-w-0 truncate text-[13px] text-subtle line-through">
        {{ row.label || t('capture.review.deadlines.removed') }}
      </p>
      <Button size="xs" variant="ghost" @click="emit('restore')">
        <Undo2 aria-hidden="true" />{{ t('capture.review.deadlines.undo') }}
      </Button>
    </div>

    <template v-else>
      <div class="flex flex-wrap items-center gap-2">
        <label class="flex cursor-pointer items-center gap-1.5 text-xs font-medium" :class="primary ? 'text-primary-text' : 'text-muted'">
          <input type="radio" class="size-4 accent-[var(--color-primary)]" :name="group" :checked="primary" @change="emit('makePrimary')" />
          {{ t('capture.review.deadlines.main') }}
        </label>
        <Badge v-if="row.kind">{{ kindLabel }}</Badge>
        <Badge :tone="row.certainty === 'explicit' ? 'neutral' : 'warning'">
          {{ t(`ai.certainty.${row.certainty}`) }}
        </Badge>
        <span v-if="confidence" class="tabular text-[11px] text-subtle">{{ confidence }}</span>
        <IconButton class="ml-auto" :label="t('capture.review.deadlines.remove')" @click="emit('remove')"><Trash2 /></IconButton>
      </div>

      <div class="mt-3">
        <Field v-slot="{ id, describedby, invalid }" :label="t('capture.review.deadlines.label')">
          <Input :id="id" v-model="row.label" :aria-describedby="describedby" :invalid="invalid" :placeholder="t('capture.review.deadlines.labelPlaceholder')" size="sm" />
        </Field>
      </div>

      <div class="mt-3">
        <p class="mb-1.5 text-[13px] font-medium text-fg">{{ t('dueEditor.precisionLabel') }}</p>
        <DueEditor v-model="row.due" />
        <p v-if="needsZone" class="mt-2 flex items-start gap-1.5 rounded-lg bg-warning-soft px-2.5 py-1.5 text-xs text-warning-text" role="status">
          <AlertTriangle class="mt-px size-3.5 shrink-0" aria-hidden="true" />{{ t('capture.review.deadlines.timeZoneMissing') }}
        </p>
      </div>

      <div class="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <EvidenceQuote :text="row.evidence" :verified="row.evidenceVerified" @focus="emit('focusEvidence', `dl:${row.key}`)" />
        </div>
        <div v-if="!primary" class="w-full sm:w-60">
          <Field v-slot="{ id }" :label="t('capture.review.deadlines.createAs')">
            <Select :id="id" v-model="row.createAs" :options="createAsOptions" size="sm" />
          </Field>
        </div>
      </div>

      <ul v-if="row.issues.length" class="mt-2.5 flex flex-col gap-1 text-xs text-muted">
        <li v-for="(issue, i) in row.issues" :key="i" class="flex items-start gap-1.5">
          <Info class="mt-px size-3.5 shrink-0 text-subtle" aria-hidden="true" />
          <span>{{ issue }}</span>
        </li>
      </ul>
    </template>
  </li>
</template>
