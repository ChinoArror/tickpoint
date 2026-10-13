<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowDownRight, ArrowUpRight, CalendarDays, Info } from 'lucide-vue-next'
import Card from '@/components/ui/Card.vue'
import Badge from '@/components/ui/Badge.vue'
import ProgressRing from '@/components/ui/ProgressRing.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import { useFormat } from '@/composables/useFormat'
import { isoDateInZone } from '@shared/time'
import { useGoalFormat } from './goalFormat'
import type { Goal } from '@/lib/types'

const props = defineProps<{ goal: Goal }>()
const { t } = useI18n()
const f = useFormat()
const gf = useGoalFormat()

const h = computed(() => props.goal.health)
const pct = computed(() => h.value.actual * 100)
const expectedPct = computed(() => (h.value.expected == null ? null : h.value.expected * 100))
const hasTarget = computed(() => !!props.goal.targetDate)
const outlook = computed(() => gf.outlookMeta(h.value.outlook))
const deviationPts = computed(() => (h.value.deviation == null ? null : Math.round(h.value.deviation * 100)))
const aheadOfPlan = computed(() => (h.value.deviation ?? 0) >= 0)
const projection = computed(() =>
  h.value.projectedCompletionAt == null ? null : f.date(isoDateInZone(h.value.projectedCompletionAt, f.tz.value)),
)
</script>

<template>
  <Card :title="t('goalPage.health.title')" class="h-full">
    <div class="flex flex-col gap-5 sm:flex-row sm:items-center">
      <ProgressRing :value="pct" :size="120" :stroke="10" :tone="gf.ringTone(goal)" class="shrink-0" />

      <div class="min-w-0 flex-1 space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <Badge :tone="outlook.tone">
            <component :is="outlook.icon" aria-hidden="true" />{{ outlook.text }}
          </Badge>
        </div>

        <div class="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p class="text-xs text-muted">{{ t('goalPage.health.actual') }}</p>
            <p class="tabular text-lg font-semibold text-fg">{{ f.percent(h.actual) }}</p>
          </div>

          <template v-if="hasTarget">
            <div>
              <p class="text-xs text-muted">{{ t('goalPage.health.expected') }}</p>
              <p class="tabular text-lg font-semibold text-fg">{{ f.percent(h.expected) }}</p>
            </div>
            <div class="col-span-2">
              <p class="text-xs text-muted">{{ t('goalPage.health.deviation') }}</p>
              <p class="tabular flex items-center gap-1 font-medium" :class="aheadOfPlan ? 'text-success-text' : 'text-warning-text'">
                <ArrowUpRight v-if="aheadOfPlan" class="size-4" aria-hidden="true" />
                <ArrowDownRight v-else class="size-4" aria-hidden="true" />
                <span>{{ deviationPts != null && deviationPts > 0 ? '+' : '' }}{{ deviationPts ?? 0 }} {{ t('goalPage.health.points') }}</span>
                <span class="font-normal text-muted">· {{ aheadOfPlan ? t('goalPage.health.aheadShort') : t('goalPage.health.behindShort') }}</span>
              </p>
            </div>
            <div class="col-span-2">
              <p class="flex items-center gap-1 text-xs text-muted">
                {{ t('goalPage.health.projection') }}
                <Tooltip :text="t('goalPage.health.projectionHint')">
                  <button type="button" class="inline-grid size-4 place-items-center rounded-full text-subtle hover:text-fg" :aria-label="t('goalPage.health.projectionHint')">
                    <Info class="size-3.5" aria-hidden="true" />
                  </button>
                </Tooltip>
              </p>
              <p class="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-fg">
                <CalendarDays class="size-4 text-muted" aria-hidden="true" />
                {{ projection ?? t('goalPage.health.noProjection') }}
              </p>
            </div>
            <div class="col-span-2 text-xs text-muted">
              {{ t('goalPage.health.targetDate', { date: f.relativeDay(goal.targetDate!) }) }}
            </div>
          </template>

          <template v-else>
            <div class="col-span-2">
              <p class="text-xs text-muted">{{ t('goalPage.health.activeDays') }}</p>
              <p class="tabular text-lg font-semibold text-fg">{{ h.activeDays28 }} / 28</p>
              <ProgressBar :value="h.activeDays28" :max="28" size="sm" class="mt-2" :label="t('goalPage.health.activeDays')" />
            </div>
            <p class="col-span-2 text-xs text-muted">{{ t('goalPage.health.noTargetHint') }}</p>
          </template>
        </div>
      </div>
    </div>

    <div v-if="hasTarget" class="mt-5">
      <ProgressBar :value="pct" :expected="expectedPct" :tone="gf.ringTone(goal)" size="md" :label="t('goalPage.progressBarLabel')" />
      <p class="mt-1.5 text-xs text-subtle">{{ t('goalPage.health.expectedMarkerHint') }}</p>
    </div>
  </Card>
</template>
