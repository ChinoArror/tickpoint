<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { AlarmClock, CalendarDays, Clock, HelpCircle } from 'lucide-vue-next'
import { useNow } from '@/composables/useNow'
import { useFormat } from '@/composables/useFormat'
import type { Due } from '@/lib/types'

/**
 * Live countdown for exact deadlines; calendar label for date-only ones.
 * Urgency is conveyed by icon + text, not by color alone.
 */
const props = withDefaults(defineProps<{ due: Due; completed?: boolean; size?: 'sm' | 'md'; showDate?: boolean }>(), { size: 'sm' })
const { t } = useI18n()
const now = useNow()
const f = useFormat()

const state = computed(() => {
  const d = props.due
  if (d.precision === 'unknown' || d.sortAt == null) return { tone: 'neutral', icon: HelpCircle, text: t('due.unknown'), title: t('due.unknown') }
  if (props.completed) return { tone: 'neutral', icon: CalendarDays, text: d.precision === 'exact' ? f.dateTime(d.at) : f.date(d.date), title: f.due(d) }
  if (d.precision === 'exact' && d.at != null) {
    const c = f.countdown(d.at, now.value)
    const hours = c.parts.totalMs / 3_600_000
    const tone = c.parts.overdue ? 'danger' : hours < 24 ? 'warning' : hours < 72 ? 'primary' : 'neutral'
    return { tone, icon: c.parts.overdue ? AlarmClock : Clock, text: c.text, title: f.due(d) }
  }
  // Date-only: overdue once the whole day has passed (sortAt = end of that day).
  const overdue = d.sortAt < now.value
  const label = f.relativeDay(d.date!)
  return {
    tone: overdue ? 'danger' : d.date === f.today.value ? 'warning' : 'neutral',
    icon: overdue ? AlarmClock : CalendarDays,
    text: overdue ? t('countdown.overdueSince', { date: label }) : d.precision === 'approximate' ? t('due.approx', { date: label }) : label,
    title: f.due(d),
  }
})
const tones: Record<string, string> = {
  neutral: 'text-muted bg-surface-sunken',
  primary: 'text-primary-text bg-primary-softer',
  warning: 'text-warning-text bg-warning-soft',
  danger: 'text-danger-text bg-danger-soft',
}
</script>

<template>
  <span
    class="tabular inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-md font-medium transition-colors duration-300"
    :class="[tones[state.tone], size === 'sm' ? 'h-5 px-1.5 text-[11px] [&_svg]:size-3' : 'h-7 px-2.5 text-[13px] [&_svg]:size-3.5']"
    :title="state.title"
  >
    <component :is="state.icon" aria-hidden="true" class="shrink-0" :class="state.tone === 'danger' && !completed ? 'animate-[pulse_2s_ease-in-out_infinite]' : ''" />
    <span class="truncate">{{ state.text }}</span>
  </span>
</template>
