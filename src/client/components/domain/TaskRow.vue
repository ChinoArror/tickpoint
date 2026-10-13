<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { CornerDownRight, Flag, GitBranch, ListChecks, Lock, MoreHorizontal, Pause } from 'lucide-vue-next'
import TaskCheck from './TaskCheck.vue'
import CountdownChip from './CountdownChip.vue'
import RiskBadge from './RiskBadge.vue'
import ProgressRing from '@/components/ui/ProgressRing.vue'
import Badge from '@/components/ui/Badge.vue'
import Menu, { type MenuItem } from '@/components/ui/Menu.vue'
import { useTaskActions } from '@/composables/useTasks'
import { useUiStore } from '@/stores/ui'
import { useProjects } from '@/composables/useTasks'
import type { Task } from '@/lib/types'

const props = withDefaults(defineProps<{ task: Task; showProject?: boolean; showRisk?: boolean; dense?: boolean; menu?: MenuItem[] }>(), { showProject: true, showRisk: true })
const { t } = useI18n()
const ui = useUiStore()
const actions = useTaskActions()
const { data: projects } = useProjects()
const project = computed(() => (props.showProject && props.task.projectId ? projects.value?.find((p) => p.id === props.task.projectId) : null))
const done = computed(() => props.task.status === 'completed')
const showRiskBadge = computed(() => props.showRisk && !done.value && ['attention', 'at_risk', 'overdue'].includes(props.task.risk.level))
const priorityTone: Record<string, string> = { urgent: 'text-danger', high: 'text-warning' }
</script>

<template>
  <div
    class="group relative flex cursor-pointer items-start gap-3 rounded-xl px-3 transition-[background-color,opacity] duration-200 hover:bg-surface-hover focus-within:bg-surface-hover"
    :class="[dense ? 'py-2' : 'py-2.5', done && 'opacity-60']"
    role="listitem"
    @click="ui.openTask(task.id)"
  >
    <TaskCheck
      class="mt-0.5"
      :checked="done"
      :priority="task.priority"
      :shape="task.kind === 'deadline' ? 'diamond' : 'circle'"
      :label="done ? t('task.markIncomplete', { title: task.title }) : t('task.markComplete', { title: task.title })"
      @toggle="actions.toggleComplete.mutate(task)"
    />
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2">
        <button type="button" class="min-w-0 truncate text-left text-sm font-medium text-fg outline-none" :class="done && 'line-through decoration-subtle'" @click.stop="ui.openTask(task.id)">
          {{ task.title }}
        </button>
        <Flag v-if="task.priority === 'urgent' || task.priority === 'high'" class="size-3.5 shrink-0" :class="priorityTone[task.priority]" :aria-label="t(`priority.${task.priority}`)" />
        <Badge v-if="task.kind === 'deadline'" tone="primary" class="hidden sm:inline-flex">{{ t('task.kind.deadline') }}</Badge>
      </div>
      <div class="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted">
        <CountdownChip v-if="task.due.precision !== 'unknown'" :due="task.due" :completed="done" />
        <span v-if="task.status === 'paused'" class="inline-flex items-center gap-1"><Pause class="size-3" aria-hidden="true" />{{ t('status.paused') }}</span>
        <span v-if="task.counts.checkpoints" class="inline-flex items-center gap-1 tabular" :title="t('task.checkpointsProgress')">
          <ListChecks class="size-3.5" aria-hidden="true" />{{ task.counts.checkpointsDone }}/{{ task.counts.checkpoints }}
        </span>
        <span v-if="task.counts.subtasks" class="inline-flex items-center gap-1 tabular" :title="t('task.subtasksProgress')">
          <CornerDownRight class="size-3.5" aria-hidden="true" />{{ task.counts.subtasksDone }}/{{ task.counts.subtasks }}
        </span>
        <span v-if="task.counts.openDependencies" class="inline-flex items-center gap-1 text-warning-text" :title="t('task.blocked')">
          <Lock class="size-3" aria-hidden="true" />{{ t('task.blockedBy', { n: task.counts.openDependencies }) }}
        </span>
        <span v-if="task.goalId && !task.counts.checkpoints" class="inline-flex items-center gap-1"><GitBranch class="size-3" aria-hidden="true" /></span>
        <span v-if="project" class="inline-flex items-center gap-1.5 truncate">
          <span class="size-2 rounded-full" :style="{ background: project.color ?? 'var(--primary)' }" aria-hidden="true" />{{ project.name }}
        </span>
        <RiskBadge v-if="showRiskBadge" :risk="task.risk" />
      </div>
    </div>
    <ProgressRing v-if="!done && task.progressPercent > 0 && !dense" :value="task.progressPercent" :size="28" :stroke="3" class="mt-0.5 hidden sm:inline-grid" :tone="task.risk.level === 'at_risk' || task.risk.level === 'overdue' ? 'danger' : 'primary'" />
    <Menu v-if="menu?.length" :items="menu">
      <button type="button" class="grid size-7 shrink-0 place-items-center rounded-md text-subtle opacity-0 transition hover:bg-surface hover:text-fg focus:opacity-100 group-hover:opacity-100 max-md:opacity-100" :aria-label="t('common.moreActions')" @click.stop>
        <MoreHorizontal class="size-4" />
      </button>
    </Menu>
  </div>
</template>
