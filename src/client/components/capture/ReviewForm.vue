<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { AlertTriangle, CalendarClock, Plus, Sparkles, X } from 'lucide-vue-next'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Field from '@/components/ui/Field.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Segmented from '@/components/ui/Segmented.vue'
import Switch from '@/components/ui/Switch.vue'
import Textarea from '@/components/ui/Textarea.vue'
import { REMINDER_PRESETS, REQUIREMENT_TYPES, REWARD_TYPES } from '@shared/constants'
import DeadlineRowItem from './DeadlineRow.vue'
import ItemListEditor from './ItemListEditor.vue'
import EvidenceQuote from './EvidenceQuote.vue'
import {
  LOCATION_FIELDS,
  ensurePrimary,
  isHttpUrl,
  newListRow,
  newManualDeadline,
  type ListRow,
  type RecordKind,
  type ReviewState,
} from './reviewModel'

/** The editable right-hand review pane. Mutates the shared review state in place. */
const props = defineProps<{ state: ReviewState; projects: { value: string | null; label: string }[] }>()
const emit = defineEmits<{ focusEvidence: [key: string] }>()
const { t } = useI18n()

const groupName = 'capture-main-deadline'
const newFormat = ref('')

const kindOptions = computed<{ value: RecordKind; label: string }[]>(() => [
  { value: 'deadline', label: t('capture.review.summaryFields.kinds.deadline') },
  { value: 'task', label: t('capture.review.summaryFields.kinds.task') },
  { value: 'goal', label: t('capture.review.summaryFields.kinds.goal') },
])
const requirementOptions = computed(() => REQUIREMENT_TYPES.map((v) => ({ value: v, label: t(`capture.review.types.requirement.${v}`) })))
const rewardOptions = computed(() => REWARD_TYPES.map((v) => ({ value: v, label: t(`capture.review.types.reward.${v}`) })))

const liveDeadlines = computed(() => props.state.deadlines.filter((d) => !d.removed))
const ambiguitiesLeft = computed(() => props.state.ambiguities.filter((a) => !a.reviewed).length)
const urlInvalid = computed(() => !!props.state.submission.url.trim() && !isHttpUrl(props.state.submission.url.trim()))
const hasSubmission = computed(() => {
  const s = props.state.submission
  return !!(s.method || s.platform || s.url || s.destination || s.naming || s.sizeLimit || s.copies || s.conditions || s.fileFormats.length || s.evidence)
})

function makePrimary(key: string) {
  props.state.primaryKey = key
}
function removeDeadline(key: string) {
  const row = props.state.deadlines.find((d) => d.key === key)
  if (!row) return
  row.removed = true
  ensurePrimary(props.state)
}
function restoreDeadline(key: string) {
  const row = props.state.deadlines.find((d) => d.key === key)
  if (row) row.removed = false
}
function addDeadline() {
  props.state.deadlines.push(newManualDeadline())
  if (!props.state.primaryKey) ensurePrimary(props.state)
}

function removeFrom(list: ListRow[], key: string) {
  const i = list.findIndex((x) => x.key === key)
  if (i >= 0) list.splice(i, 1)
}

function addFormat() {
  const v = newFormat.value.trim()
  if (!v) return
  if (!props.state.submission.fileFormats.includes(v)) props.state.submission.fileFormats.push(v)
  newFormat.value = ''
}

function toggleReminder(key: string) {
  const list = props.state.reminderKeys
  const i = list.indexOf(key)
  if (i >= 0) list.splice(i, 1)
  else list.push(key)
}

function markReviewed(key: string) {
  const a = props.state.ambiguities.find((x) => x.key === key)
  if (a) a.reviewed = true
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Banner -->
    <div class="flex flex-col items-start gap-2 rounded-2xl border border-ai/25 bg-ai-soft p-3.5">
      <Badge tone="ai" class="shrink-0"><Sparkles aria-hidden="true" />{{ t('ai.unconfirmed') }}</Badge>
      <p class="min-w-0 text-[13px] leading-relaxed text-fg">{{ t('capture.review.banner') }}</p>
    </div>

    <!-- Summary -->
    <Card :title="t('capture.review.sections.summary')">
      <div class="grid gap-3.5 sm:grid-cols-2">
        <Field v-slot="{ id, describedby, invalid }" :label="t('capture.review.summaryFields.title')" class="sm:col-span-2">
          <Input :id="id" v-model="state.title" :aria-describedby="describedby" :invalid="invalid || !state.title.trim()" />
        </Field>
        <div class="flex flex-col gap-1.5">
          <p class="text-[13px] font-medium text-fg">{{ t('capture.review.summaryFields.category') }}</p>
          <div><Badge tone="primary">{{ state.category || t('common.none') }}</Badge></div>
        </div>
        <Field v-slot="{ id, describedby }" :label="t('capture.review.summaryFields.organization')">
          <Input :id="id" v-model="state.organization" :aria-describedby="describedby" />
        </Field>
        <Field v-slot="{ id, describedby }" :label="t('capture.review.summaryFields.summary')" class="sm:col-span-2">
          <Textarea :id="id" v-model="state.summary" :aria-describedby="describedby" rows="3" />
        </Field>
        <Field v-slot="{ id, describedby }" :label="t('capture.review.summaryFields.sourceLanguage')">
          <Input :id="id" v-model="state.sourceLanguage" :aria-describedby="describedby" size="sm" />
        </Field>
        <div class="flex flex-col gap-1.5 sm:col-span-2">
          <p class="text-[13px] font-medium text-fg">{{ t('capture.review.summaryFields.recordKind') }}</p>
          <Segmented v-model="state.recordKind" :options="kindOptions" :label="t('capture.review.summaryFields.recordKind')" class="w-full [&>button]:flex-1" />
        </div>
      </div>
    </Card>

    <!-- Deadlines -->
    <Card :title="t('capture.review.sections.deadlines')">
      <TransitionGroup name="list" tag="ul" class="relative flex flex-col gap-2.5">
        <DeadlineRowItem
          v-for="row in state.deadlines"
          :key="row.key"
          :row="row"
          :primary="state.primaryKey === row.key && !row.removed"
          :group="groupName"
          @make-primary="makePrimary(row.key)"
          @remove="removeDeadline(row.key)"
          @restore="restoreDeadline(row.key)"
          @focus-evidence="(k) => emit('focusEvidence', k)"
        />
      </TransitionGroup>
      <p v-if="!liveDeadlines.length && !state.deadlines.length" class="mt-2 text-xs text-subtle">{{ t('capture.review.deadlines.empty') }}</p>
      <Button variant="ghost" size="sm" class="mt-2.5 self-start" @click="addDeadline"><Plus aria-hidden="true" />{{ t('capture.review.deadlines.add') }}</Button>
    </Card>

    <!-- Ambiguities -->
    <Card v-if="state.ambiguities.length" :title="t('capture.review.sections.ambiguities')">
      <template #actions>
        <Badge tone="warning" :dot="ambiguitiesLeft > 0">
          {{ ambiguitiesLeft ? t('capture.review.ambiguities.remaining', { n: ambiguitiesLeft }) : t('capture.review.ambiguities.allReviewed') }}
        </Badge>
      </template>
      <p class="mb-3 text-xs text-muted">{{ t('capture.review.ambiguities.hint') }}</p>
      <ul class="flex flex-col gap-2.5">
        <li v-for="a in state.ambiguities" :key="a.key" class="rounded-xl border p-3" :class="a.reviewed ? 'border-border bg-surface' : 'border-warning/35 bg-warning-soft/40'">
          <div class="flex items-start gap-2">
            <AlertTriangle class="mt-0.5 size-4 shrink-0 text-warning-text" aria-hidden="true" />
            <div class="min-w-0 flex-1">
              <p class="text-[13px] font-medium text-fg">{{ a.description }}</p>
              <div v-if="a.options.length" class="mt-2">
                <p class="mb-1 text-xs text-muted">{{ t('capture.review.ambiguities.options') }}</p>
                <div class="flex flex-wrap gap-1.5">
                  <button
                    v-for="opt in a.options"
                    :key="opt"
                    type="button"
                    class="rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs text-fg transition-colors hover:border-border-strong hover:bg-surface-hover"
                    @click="markReviewed(a.key)"
                  >{{ opt }}</button>
                </div>
              </div>
              <div class="mt-2">
                <EvidenceQuote :text="a.evidence" :verified="a.evidenceVerified ?? true" compact @focus="emit('focusEvidence', `amb:${a.key}`)" />
              </div>
            </div>
          </div>
          <label class="mt-2.5 flex cursor-pointer items-center gap-2 border-t border-border pt-2.5 text-xs font-medium text-fg">
            <input v-model="a.reviewed" type="checkbox" class="size-4 accent-[var(--color-primary)]" />
            {{ t('capture.review.ambiguities.reviewed') }}
          </label>
        </li>
      </ul>
    </Card>

    <!-- Location -->
    <Card :title="t('capture.review.sections.location')">
      <div class="grid gap-3 sm:grid-cols-2">
        <Field v-for="f in LOCATION_FIELDS" :key="f" v-slot="{ id, describedby }" :label="t(`capture.review.location.${f}`)" :class="f === 'physical' ? 'sm:col-span-2' : ''">
          <Input :id="id" v-model="state.location[f]" :aria-describedby="describedby" />
        </Field>
      </div>
      <div v-if="state.locationEvidence.length" class="mt-3 flex flex-col gap-2">
        <EvidenceQuote v-for="l in state.locationEvidence" :key="l.key" :text="l.text" :verified="l.verified" compact @focus="emit('focusEvidence', `loc:${l.key}`)" />
      </div>
    </Card>

    <!-- Submission -->
    <Card :title="t('capture.review.sections.submission')">
      <p v-if="!hasSubmission" class="mb-3 text-xs text-subtle">{{ t('capture.review.submission.empty') }}</p>
      <div class="grid gap-3 sm:grid-cols-2">
        <Field v-slot="{ id, describedby }" :label="t('capture.review.submission.method')">
          <Input :id="id" v-model="state.submission.method" :aria-describedby="describedby" />
        </Field>
        <Field v-slot="{ id, describedby }" :label="t('capture.review.submission.platform')">
          <Input :id="id" v-model="state.submission.platform" :aria-describedby="describedby" />
        </Field>
        <Field v-slot="{ id, describedby, invalid }" :label="t('capture.review.submission.url')" :error="urlInvalid ? t('capture.review.submission.urlInvalid') : null" class="sm:col-span-2">
          <Input :id="id" v-model="state.submission.url" type="url" inputmode="url" :aria-describedby="describedby" :invalid="invalid" />
        </Field>
        <Field v-slot="{ id, describedby }" :label="t('capture.review.submission.destination')" class="sm:col-span-2">
          <Input :id="id" v-model="state.submission.destination" :aria-describedby="describedby" />
        </Field>
        <div class="flex flex-col gap-1.5 sm:col-span-2">
          <Field v-slot="{ id, describedby }" :label="t('capture.review.submission.fileFormats')" :hint="t('capture.review.submission.fileFormatsHint')">
            <div class="flex flex-col gap-2">
              <div v-if="state.submission.fileFormats.length" class="flex flex-wrap gap-1.5">
                <span v-for="fmt in state.submission.fileFormats" :key="fmt" class="inline-flex items-center gap-0.5 rounded-full bg-surface-sunken py-0.5 pl-2.5 pr-0.5 text-xs text-fg">
                  {{ fmt }}
                  <IconButton size="sm" :label="`${t('common.remove')}: ${fmt}`" class="size-6" @click="state.submission.fileFormats.splice(state.submission.fileFormats.indexOf(fmt), 1)"><X /></IconButton>
                </span>
              </div>
              <Input :id="id" v-model="newFormat" size="sm" :placeholder="t('capture.review.submission.fileFormatsPlaceholder')" :aria-describedby="describedby" @keydown.enter.prevent="addFormat" />
            </div>
          </Field>
        </div>
        <Field v-slot="{ id, describedby }" :label="t('capture.review.submission.naming')">
          <Input :id="id" v-model="state.submission.naming" :aria-describedby="describedby" />
        </Field>
        <Field v-slot="{ id, describedby }" :label="t('capture.review.submission.sizeLimit')">
          <Input :id="id" v-model="state.submission.sizeLimit" :aria-describedby="describedby" />
        </Field>
        <Field v-slot="{ id, describedby }" :label="t('capture.review.submission.copies')">
          <Input :id="id" v-model="state.submission.copies" :aria-describedby="describedby" />
        </Field>
        <Field v-slot="{ id, describedby }" :label="t('capture.review.submission.conditions')">
          <Input :id="id" v-model="state.submission.conditions" :aria-describedby="describedby" />
        </Field>
      </div>
      <div class="mt-3">
        <EvidenceQuote :text="state.submission.evidence" :verified="state.submission.evidenceVerified" compact @focus="emit('focusEvidence', 'sub')" />
      </div>
    </Card>

    <!-- Deliverables / requirements / rewards -->
    <Card :title="t('capture.review.sections.deliverables')">
      <ItemListEditor
        :items="state.deliverables"
        evidence-prefix="del"
        :section-label="t('capture.review.sections.deliverables')"
        :add-label="t('capture.review.list.add')"
        :empty-label="t('capture.review.list.empty')"
        @add="state.deliverables.push(newListRow())"
        @remove="(k) => removeFrom(state.deliverables, k)"
        @focus-evidence="(k) => emit('focusEvidence', k)"
      />
    </Card>
    <Card :title="t('capture.review.sections.requirements')">
      <ItemListEditor
        :items="state.requirements"
        evidence-prefix="req"
        :type-options="requirementOptions"
        :section-label="t('capture.review.sections.requirements')"
        :add-label="t('capture.review.list.add')"
        :empty-label="t('capture.review.list.empty')"
        @add="state.requirements.push(newListRow('mandatory'))"
        @remove="(k) => removeFrom(state.requirements, k)"
        @focus-evidence="(k) => emit('focusEvidence', k)"
      />
    </Card>
    <Card :title="t('capture.review.sections.rewards')">
      <ItemListEditor
        :items="state.rewards"
        evidence-prefix="rew"
        :type-options="rewardOptions"
        :section-label="t('capture.review.sections.rewards')"
        :add-label="t('capture.review.list.add')"
        :empty-label="t('capture.review.list.empty')"
        @add="state.rewards.push(newListRow('other'))"
        @remove="(k) => removeFrom(state.rewards, k)"
        @focus-evidence="(k) => emit('focusEvidence', k)"
      />
    </Card>

    <!-- Suggested checkpoints -->
    <Card v-if="state.suggestions.length" :title="t('capture.review.sections.suggestions')">
      <p class="mb-3 flex items-start gap-1.5 text-xs text-muted"><CalendarClock class="mt-px size-3.5 shrink-0 text-subtle" aria-hidden="true" />{{ t('capture.review.suggestions.hint') }}</p>
      <ul class="flex flex-col gap-2.5">
        <li v-for="s in state.suggestions" :key="s.key" class="rounded-xl border p-3 transition-colors" :class="s.include ? 'border-primary/35 bg-surface' : 'border-border bg-surface-sunken/60'">
          <label class="flex cursor-pointer items-center gap-2 text-xs font-medium text-fg">
            <input v-model="s.include" type="checkbox" class="size-4 accent-[var(--color-primary)]" />
            {{ t('capture.review.suggestions.include') }}
            <Badge tone="info" class="ml-auto">{{ t('plan.card.suggestion') }}</Badge>
          </label>
          <div class="mt-2.5 grid gap-2.5" :class="s.include ? '' : 'opacity-60'">
            <Field v-slot="{ id, describedby }" :label="t('capture.review.suggestions.title')">
              <Input :id="id" v-model="s.title" size="sm" :aria-describedby="describedby" />
            </Field>
            <Field v-slot="{ id, describedby }" :label="t('capture.review.suggestions.criteria')">
              <Textarea :id="id" v-model="s.criteria" rows="2" :aria-describedby="describedby" />
            </Field>
            <div class="grid grid-cols-2 gap-2.5">
              <Field v-slot="{ id, describedby }" :label="t('capture.review.suggestions.targetDate')">
                <Input :id="id" v-model="s.targetDate" type="date" size="sm" :aria-describedby="describedby" />
              </Field>
              <Field v-slot="{ id, describedby }" :label="t('capture.review.suggestions.minutes')">
                <Input :id="id" v-model="s.minutes" type="number" min="0" size="sm" :aria-describedby="describedby" />
              </Field>
            </div>
          </div>
        </li>
      </ul>
    </Card>

    <!-- Warnings -->
    <Card v-if="state.warnings.length" :title="t('capture.review.sections.warnings')">
      <ul class="flex flex-col gap-2">
        <li v-for="(w, i) in state.warnings" :key="i" class="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning-text">
          <AlertTriangle class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{{ w }}</span>
        </li>
      </ul>
    </Card>

    <!-- Options -->
    <Card :title="t('capture.review.sections.options')">
      <div class="flex flex-col gap-4">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="text-[13px] font-medium text-fg" id="save-source-label">{{ t('capture.review.options.saveSource') }}</p>
            <p class="mt-0.5 text-xs text-subtle">{{ t('capture.review.options.saveSourceHint') }}</p>
          </div>
          <Switch v-model="state.saveSource" :label="t('capture.review.options.saveSource')" />
        </div>
        <Field v-slot="{ id, describedby }" :label="t('capture.review.options.project')">
          <Select :id="id" v-model="state.projectId" :options="projects" :aria-describedby="describedby" />
        </Field>
        <div class="flex flex-col gap-2">
          <p class="text-[13px] font-medium text-fg">{{ t('capture.review.options.reminders') }}</p>
          <p class="text-xs text-subtle">{{ t('capture.review.options.remindersHint') }}</p>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="p in REMINDER_PRESETS"
              :key="p.key"
              type="button"
              :aria-pressed="state.reminderKeys.includes(p.key)"
              class="rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
              :class="state.reminderKeys.includes(p.key) ? 'border-primary bg-primary-soft text-primary-text' : 'border-border bg-surface text-muted hover:text-fg'"
              @click="toggleReminder(p.key)"
            >{{ t(`capture.review.options.presets.${p.key}`) }}</button>
          </div>
        </div>
      </div>
    </Card>
  </div>
</template>
