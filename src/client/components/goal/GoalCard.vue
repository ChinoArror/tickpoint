<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { CalendarDays } from 'lucide-vue-next'
import Card from '@/components/ui/Card.vue'
import Badge from '@/components/ui/Badge.vue'
import ProgressRing from '@/components/ui/ProgressRing.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import { useFormat } from '@/composables/useFormat'
import { useGoalFormat } from './goalFormat'
import type { Goal } from '@/lib/types'

const props = defineProps<{ goal: Goal }>()
const { t } = useI18n()
const f = useFormat()
const gf = useGoalFormat()

const pct = computed(() => props.goal.health.actual * 100)
const expected = computed(() => (props.goal.health.expected == null ? null : props.goal.health.expected * 100))
const outlook = computed(() => gf.outlookMeta(props.goal.health.outlook))
</script>

<template>
  <RouterLink
    :to="`/goals/${goal.id}`"
    class="block h-full rounded-[var(--radius-lg)] outline-none focus-visible:ring-3 focus-visible:ring-[var(--focus-ring)]"
  >
    <Card interactive :padded="false" class="h-full">
      <div class="flex h-full flex-col">
      <div class="flex items-start gap-3 p-4">
        <ProgressRing :value="pct" :size="46" :tone="gf.ringTone(goal)" />
        <div class="min-w-0 flex-1">
          <h2 class="truncate text-[15px] font-semibold text-fg">{{ goal.title }}</h2>
          <p class="tabular mt-0.5 truncate text-xs text-muted">{{ gf.progressText(goal) }}</p>
        </div>
      </div>
      <div class="px-4">
        <ProgressBar :value="pct" :tone="gf.ringTone(goal)" :expected="expected" :label="t('goalPage.progressBarLabel')" />
      </div>
      <div class="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5">
        <Badge :tone="outlook.tone">
          <component :is="outlook.icon" aria-hidden="true" />{{ outlook.text }}
        </Badge>
        <span v-if="goal.targetDate" class="inline-flex items-center gap-1 text-xs text-muted">
          <CalendarDays class="size-3.5" aria-hidden="true" />{{ f.relativeDay(goal.targetDate) }}
        </span>
        <div v-else class="flex items-center gap-2 text-xs text-muted">
          <span>{{ t('goalPage.noTargetDate') }}</span>
          <ProgressBar
            :value="goal.health.activeDays28"
            :max="28"
            size="xs"
            class="w-16"
            :label="t('goalPage.consistencyLabel', { n: goal.health.activeDays28 })"
          />
        </div>
      </div>
      </div>
    </Card>
  </RouterLink>
</template>
