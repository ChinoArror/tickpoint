<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { AlertTriangle, FolderKanban, MoreHorizontal, Pencil, Plus, Archive, ArchiveRestore, Trash2 } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Segmented from '@/components/ui/Segmented.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import Menu, { type MenuItem } from '@/components/ui/Menu.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import CountdownChip from '@/components/domain/CountdownChip.vue'
import ProjectFormDialog from '@/components/project/ProjectFormDialog.vue'
import { useProjectActions } from '@/components/project/projectActions'
import { useProjects, useTaskList } from '@/composables/useTasks'
import type { Project, Task } from '@/lib/types'

const { t } = useI18n()
const actions = useProjectActions()

const status = ref<'active' | 'archived'>('active')
const statusOptions = computed(() => [
  { value: 'active' as const, label: t('projects.status.active') },
  { value: 'archived' as const, label: t('projects.status.archived') },
])

const { data: projects, isPending, isError, refetch } = useProjects()
// One task query for all cards; counts are computed client-side.
const { data: tasksPage } = useTaskList(() => ({ view: 'all', limit: 200 }))

interface ProjectStats {
  open: number
  done: number
  next: Task | null
}

const statsByProject = computed(() => {
  const map = new Map<string, ProjectStats>()
  for (const task of tasksPage.value?.items ?? []) {
    if (!task.projectId || task.status === 'archived') continue
    const s = map.get(task.projectId) ?? { open: 0, done: 0, next: null }
    if (task.status === 'completed') {
      s.done++
    } else {
      s.open++
      const at = task.due.sortAt
      if (at != null && task.due.precision !== 'unknown' && (s.next == null || at < (s.next.due.sortAt ?? Infinity))) s.next = task
    }
    map.set(task.projectId, s)
  }
  return map
})

const visible = computed(() => (projects.value ?? []).filter((p) => p.status === status.value))

const formOpen = ref(false)
const editing = ref<Project | null>(null)
function openCreate() {
  editing.value = null
  formOpen.value = true
}
function openEdit(p: Project) {
  editing.value = p
  formOpen.value = true
}

function menuFor(p: Project): MenuItem[] {
  return [
    { label: t('common.edit'), icon: Pencil, onSelect: () => openEdit(p) },
    p.status === 'archived'
      ? { label: t('projects.actions.unarchive'), icon: ArchiveRestore, onSelect: () => actions.setStatus.mutate({ id: p.id, status: 'active' }) }
      : { label: t('projects.actions.archive'), icon: Archive, onSelect: () => actions.setStatus.mutate({ id: p.id, status: 'archived' }) },
    { separator: true },
    { label: t('common.delete'), icon: Trash2, danger: true, onSelect: () => actions.remove(p) },
  ]
}

function statsOf(p: Project) {
  const s = statsByProject.value.get(p.id)
  const total = (s?.open ?? 0) + (s?.done ?? 0)
  return { open: s?.open ?? 0, done: s?.done ?? 0, next: s?.next ?? null, percent: total ? ((s?.done ?? 0) / total) * 100 : 0 }
}
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div class="animate-fade-up">
        <h1 class="text-2xl font-semibold tracking-tight text-fg md:text-[28px]">{{ t('nav.projects') }}</h1>
        <p class="mt-1 text-[13px] text-muted">{{ t('projects.subtitle') }}</p>
      </div>
      <Button variant="primary" @click="openCreate()"><Plus class="size-4" aria-hidden="true" />{{ t('projects.new') }}</Button>
    </header>

    <div class="mt-6 flex overflow-x-auto">
      <Segmented v-model="status" :options="statusOptions" :label="t('projects.filterLabel')" size="sm" />
    </div>

    <div v-if="isPending" class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
      <Skeleton v-for="i in 3" :key="i" :rows="1" height="150px" />
    </div>

    <div v-else-if="isError" class="mt-8">
      <EmptyState :icon="AlertTriangle" :title="t('errors.loadFailed')" :description="t('errors.tryAgainHint')">
        <Button @click="refetch()">{{ t('common.retry') }}</Button>
      </EmptyState>
    </div>

    <div v-else-if="!visible.length" class="mt-6 rounded-2xl border border-dashed border-border-strong bg-surface p-2">
      <EmptyState
        :icon="FolderKanban"
        :title="status === 'active' ? t('projects.empty.title') : t('projects.empty.archivedTitle')"
        :description="status === 'active' ? t('projects.empty.description') : t('projects.empty.archivedDescription')"
      >
        <Button v-if="status === 'active'" class="mt-4" variant="secondary" size="sm" @click="openCreate()">{{ t('projects.new') }}</Button>
      </EmptyState>
    </div>

    <div v-else class="stagger mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div v-for="(p, i) in visible" :key="p.id" class="relative min-w-0" :style="{ '--i': i }">
        <RouterLink
          :to="`/projects/${p.id}`"
          class="block h-full rounded-[var(--radius-lg)] outline-none focus-visible:ring-3 focus-visible:ring-[var(--focus-ring)]"
        >
          <Card interactive :padded="false" class="h-full">
          <div class="flex h-full flex-col gap-4 p-4">
            <div class="flex items-start gap-3 pr-8">
              <span
                class="mt-1.5 size-3 shrink-0 rounded-full"
                :class="!p.color && 'bg-border-strong'"
                :style="p.color ? { backgroundColor: p.color } : undefined"
                aria-hidden="true"
              />
              <div class="min-w-0">
                <h2 class="truncate text-[15px] font-semibold text-fg">{{ p.name }}</h2>
                <p v-if="p.description" class="mt-0.5 line-clamp-2 text-xs text-muted">{{ p.description }}</p>
              </div>
            </div>

            <div class="mt-auto space-y-2">
              <ProgressBar :value="statsOf(p).percent" tone="success" :label="t('projects.progressLabel')" />
              <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                <span class="tabular">{{ t('projects.counts', { open: statsOf(p).open, done: statsOf(p).done }) }}</span>
                <CountdownChip v-if="statsOf(p).next" :due="statsOf(p).next!.due" />
                <span v-else>{{ t('projects.noDeadline') }}</span>
              </div>
            </div>
          </div>
          </Card>
        </RouterLink>

        <Menu :items="menuFor(p)">
          <button
            type="button"
            class="absolute right-3 top-3 grid size-8 place-items-center rounded-lg text-subtle transition hover:bg-surface-hover hover:text-fg max-md:opacity-100"
            :aria-label="t('common.moreActions')"
          >
            <MoreHorizontal class="size-4" aria-hidden="true" />
          </button>
        </Menu>
      </div>
    </div>

    <ProjectFormDialog v-model:open="formOpen" :project="editing" />
  </div>
</template>
