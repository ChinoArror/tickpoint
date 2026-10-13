<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { AlertOctagon, AlertTriangle, CheckCircle2, CircleDashed, Eye } from 'lucide-vue-next'
import Badge from '@/components/ui/Badge.vue'
import { useFormat } from '@/composables/useFormat'
import type { Risk } from '@/lib/types'

const props = defineProps<{ risk: Risk; showReason?: boolean }>()
const { t } = useI18n()
const f = useFormat()
const map = {
  on_track: { tone: 'success', icon: CheckCircle2 },
  attention: { tone: 'warning', icon: Eye },
  at_risk: { tone: 'danger', icon: AlertTriangle },
  overdue: { tone: 'danger', icon: AlertOctagon },
  done: { tone: 'neutral', icon: CheckCircle2 },
  none: { tone: 'neutral', icon: CircleDashed },
} as const
const m = computed(() => map[props.risk.level])
const reason = computed(() => {
  const r = props.risk.reasons.find((x) => x.severity > 0) ?? props.risk.reasons[0]
  return r ? f.riskReason(r) : ''
})
</script>

<template>
  <span class="inline-flex min-w-0 max-w-full items-center gap-1.5" :title="reason">
    <Badge :tone="m.tone">
      <component :is="m.icon" aria-hidden="true" />
      {{ t(`risk.level.${risk.level}`) }}
    </Badge>
    <span v-if="showReason && reason" class="min-w-0 truncate text-xs text-muted">{{ reason }}</span>
  </span>
</template>
