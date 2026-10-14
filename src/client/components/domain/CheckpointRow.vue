<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import { Flag, ListChecks } from 'lucide-vue-next'
import TaskCheck from './TaskCheck.vue'
import Badge from '@/components/ui/Badge.vue'
import { useCheckpointActions } from '@/composables/useTasks'
import { useFormat } from '@/composables/useFormat'
import { useUiStore } from '@/stores/ui'
import type { Checkpoint } from '@/lib/types'

/**
 * A checkpoint shown in a task-like list (Overview Today, Today and Upcoming pages).
 * Mirrors TaskRow's layout so it sits naturally among tasks; the badge and parent title tell them apart.
 * `today` is the user's current calendar day (YYYY-MM-DD), used for the delayed state.
 */
const props = defineProps<{ checkpoint: Checkpoint; today: string }>()
const { t } = useI18n()
const router = useRouter()
const qc = useQueryClient()
const ui = useUiStore()
const f = useFormat()
const cpActions = useCheckpointActions()

const done = computed(() => props.checkpoint.status === 'done')
const delayed = computed(() => !done.value && !!props.checkpoint.targetDate && props.checkpoint.targetDate < props.today)

function open() {
  const cp = props.checkpoint
  if (cp.taskId) ui.openTask(cp.taskId)
  else if (cp.goalId) router.push(`/goals/${cp.goalId}`)
}

async function toggle() {
  try {
    await cpActions.toggle(props.checkpoint)
  } catch {
    // The action already reported the error to the user.
    return
  }
  qc.invalidateQueries({ queryKey: ['dashboard'] })
  qc.invalidateQueries({ queryKey: ['checkpoints-range'] })
}
</script>

<template>
  <div
    class="group relative flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 transition-[background-color,opacity] duration-200 hover:bg-surface-hover focus-within:bg-surface-hover"
    :class="done && 'opacity-60'"
    role="listitem"
    @click="open"
  >
    <TaskCheck class="mt-0.5" :checked="done" :label="t('checkpoints.toggle', { title: checkpoint.title })" @toggle="toggle" />
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2">
        <button type="button" class="min-w-0 truncate text-left text-sm font-medium text-fg outline-none" :class="done && 'line-through decoration-subtle'" @click.stop="open">
          {{ checkpoint.title }}
        </button>
        <Flag v-if="checkpoint.priority === 'urgent' || checkpoint.priority === 'high'" class="size-3.5 shrink-0" :class="checkpoint.priority === 'urgent' ? 'text-danger' : 'text-warning'" :aria-label="t(`priority.${checkpoint.priority}`)" />
        <Badge tone="info" class="hidden sm:inline-flex">{{ t('checkpointRow.badge') }}</Badge>
      </div>
      <div class="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted">
        <span v-if="checkpoint.targetDate" class="tabular">{{ f.date(checkpoint.targetDate, { short: true }) }}</span>
        <span v-if="delayed" class="font-medium text-danger-text">{{ t('checkpoints.delayed') }}</span>
        <span v-if="checkpoint.parentTitle" class="inline-flex min-w-0 items-center gap-1">
          <ListChecks class="size-3.5 shrink-0" aria-hidden="true" />
          <span class="truncate">{{ checkpoint.parentTitle }}</span>
        </span>
      </div>
    </div>
  </div>
</template>
