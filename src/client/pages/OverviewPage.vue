<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDot, Flame, Inbox, ListChecks, Plus, Sparkles, Sun, Target, TrendingUp } from 'lucide-vue-next'
import Card from '@/components/ui/Card.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ProgressRing from '@/components/ui/ProgressRing.vue'
import TaskRow from '@/components/domain/TaskRow.vue'
import TaskCheck from '@/components/domain/TaskCheck.vue'
import CountdownChip from '@/components/domain/CountdownChip.vue'
import RiskBadge from '@/components/domain/RiskBadge.vue'
import { useDashboard, useCheckpointActions, useTaskActions, useErrorMessage } from '@/composables/useTasks'
import { useFormat } from '@/composables/useFormat'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import { useToast } from '@/composables/useToast'
import { useNow } from '@/composables/useNow'
import { wallClockAt } from '@shared/time'

const { t } = useI18n()
const router = useRouter()
const qc = useQueryClient()
const session = useSessionStore()
const ui = useUiStore()
const f = useFormat()
const now = useNow()
const toast = useToast()
const errMsg = useErrorMessage()
const { data, isPending, isError, refetch } = useDashboard()
const taskActions = useTaskActions()
const cpActions = useCheckpointActions()

const name = computed(() => session.me?.user.name?.split(/\s+/)[0] ?? session.me?.user.username ?? '')
const greeting = computed(() => {
  const h = wallClockAt(now.value, f.tz.value).hour
  return t(h < 5 ? 'overview.greeting.night' : h < 12 ? 'overview.greeting.morning' : h < 18 ? 'overview.greeting.afternoon' : 'overview.greeting.evening', { name: name.value })
})
const todayLabel = computed(() => (data.value ? f.date(data.value.today, { weekday: true }) : ''))
const deadlines = computed(() => (data.value?.upcoming ?? []).filter((x) => x.due.precision !== 'unknown').slice(0, 6))
const overdueCount = computed(() => (data.value?.attention ?? []).filter((x) => x.risk.level === 'overdue').length)
const todayCount = computed(() => (data.value?.todayTasks.length ?? 0) + (data.value?.todayCheckpoints.length ?? 0))

// Quick capture: plain text becomes an Inbox task; long text goes to Smart Capture.
const capture = ref('')
const capturing = ref(false)
const looksLong = computed(() => capture.value.length > 140 || capture.value.includes('\n'))
async function submitCapture() {
  const text = capture.value.trim()
  if (!text) return
  if (looksLong.value) return sendToSmartCapture()
  capturing.value = true
  try {
    await taskActions.create({ title: text.slice(0, 300) })
    capture.value = ''
    toast.success(t('overview.capture.added'))
  } catch (e) {
    toast.error(errMsg(e))
  } finally {
    capturing.value = false
  }
}
function sendToSmartCapture() {
  try {
    sessionStorage.setItem('tp.captureDraft', capture.value)
  } catch {
    /* ignore */
  }
  router.push('/capture')
}

const stats = computed(() => [
  { key: 'today', icon: Sun, value: todayCount.value, tone: 'text-primary-text bg-primary-softer' },
  { key: 'completed', icon: CheckCircle2, value: data.value?.week.completed ?? 0, tone: 'text-success-text bg-success-soft' },
  { key: 'dueSoon', icon: Flame, value: data.value?.week.dueSoon ?? 0, tone: 'text-warning-text bg-warning-soft' },
  { key: 'overdue', icon: AlertTriangle, value: overdueCount.value, tone: 'text-danger-text bg-danger-soft' },
])

async function toggleCheckpoint(cp: { id: string; status: string; title: string }) {
  await cpActions.toggle(cp as never)
  qc.invalidateQueries({ queryKey: ['dashboard'] })
}
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
    <!-- Header -->
    <header class="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end md:justify-between">
      <div class="animate-fade-up min-w-0">
        <p class="text-[13px] font-medium text-subtle">{{ todayLabel }}</p>
        <h1 class="mt-0.5 text-2xl font-semibold tracking-tight text-fg md:text-[28px]">{{ greeting }}</h1>
      </div>
      <!-- Mobile: two equal buttons side by side -->
      <div class="grid grid-cols-2 gap-2 md:flex">
        <Button class="w-full md:w-auto" variant="secondary" @click="router.push('/capture')"><Sparkles class="size-4 text-ai" aria-hidden="true" />{{ t('nav.capture') }}</Button>
        <Button class="w-full md:w-auto" variant="primary" @click="ui.openQuickAdd()"><Plus class="size-4" aria-hidden="true" />{{ t('actions.newTask') }}</Button>
      </div>
    </header>

    <!-- Quick capture -->
    <form class="group mt-6 flex items-center gap-2 rounded-2xl border border-border bg-surface p-2 pl-4 shadow-xs transition focus-within:border-primary focus-within:shadow-md focus-within:ring-4 focus-within:ring-[var(--focus-ring)]" @submit.prevent="submitCapture">
      <Inbox class="size-4 shrink-0 text-subtle" aria-hidden="true" />
      <label for="quick-capture" class="sr-only">{{ t('overview.capture.label') }}</label>
      <input
        id="quick-capture"
        v-model="capture"
        class="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
        :placeholder="t('overview.capture.placeholder')"
        autocomplete="off"
      />
      <Transition name="fade">
        <button v-if="looksLong" type="button" class="hidden h-8 items-center gap-1.5 rounded-lg bg-ai-soft px-2.5 text-xs font-semibold text-ai sm:inline-flex" @click="sendToSmartCapture">
          <Sparkles class="size-3.5" aria-hidden="true" />{{ t('overview.capture.analyze') }}
        </button>
      </Transition>
      <Button type="submit" variant="soft" size="sm" :loading="capturing" :disabled="!capture.trim()">{{ looksLong ? t('overview.capture.analyze') : t('overview.capture.add') }}</Button>
    </form>

    <!-- Stats strip -->
    <div class="stagger mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
      <div v-for="(s, i) in stats" :key="s.key" class="flex items-center gap-2.5 rounded-2xl border border-border bg-surface p-3 shadow-xs md:gap-3 md:p-3.5" :style="{ '--i': i }">
        <span class="grid size-9 shrink-0 place-items-center rounded-xl md:size-10" :class="s.tone"><component :is="s.icon" class="size-[18px] md:size-5" aria-hidden="true" /></span>
        <div class="min-w-0">
          <p class="tabular text-xl font-semibold leading-none text-fg">
            <span v-if="isPending" class="skeleton inline-block h-5 w-6 align-middle" />
            <template v-else>{{ s.value }}</template>
          </p>
          <p class="mt-1 line-clamp-2 text-xs leading-snug text-muted">{{ t(`overview.stats.${s.key}`) }}</p>
        </div>
      </div>
    </div>

    <div v-if="isError" class="mt-8">
      <EmptyState :icon="AlertTriangle" :title="t('errors.loadFailed')" :description="t('errors.tryAgainHint')"><Button @click="refetch()">{{ t('common.retry') }}</Button></EmptyState>
    </div>

    <div v-else class="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
      <div class="flex min-w-0 flex-col gap-5">
        <!-- Today -->
        <Card :padded="false">
          <template #header>
            <div class="flex items-center gap-2">
              <Sun class="size-4 text-warning" aria-hidden="true" />
              <h2 class="text-[13px] font-semibold">{{ t('overview.today') }}</h2>
              <span class="tabular rounded-full bg-surface-sunken px-1.5 text-[11px] text-muted">{{ todayCount }}</span>
            </div>
          </template>
          <template #actions>
            <Button variant="ghost" size="xs" @click="router.push('/today')">{{ t('common.viewAll') }}<ArrowRight class="size-3.5" aria-hidden="true" /></Button>
          </template>
          <div class="px-1.5 pb-2">
            <Skeleton v-if="isPending" :rows="4" class="p-2" />
            <template v-else-if="todayCount">
              <TransitionGroup tag="div" name="list" class="tap-task-rows relative" role="list">
                <TaskRow v-for="task in data!.todayTasks" :key="task.id" :task="task" />
                <div v-for="cp in data!.todayCheckpoints" :key="cp.id" class="flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 transition hover:bg-surface-hover" role="listitem" @click="cp.taskId ? ui.openTask(cp.taskId) : router.push(`/goals/${cp.goalId}`)">
                  <TaskCheck class="mt-0.5" size="sm" :checked="cp.status === 'done'" :label="t('checkpoints.toggle', { title: cp.title })" @toggle="toggleCheckpoint(cp)" />
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm text-fg">{{ cp.title }}</p>
                    <p class="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted">
                      <ListChecks class="size-3" aria-hidden="true" />{{ cp.parentTitle }}
                      <span v-if="cp.targetDate && cp.targetDate < data!.today" class="font-medium text-danger-text">· {{ t('checkpoints.delayed') }}</span>
                    </p>
                  </div>
                </div>
              </TransitionGroup>
            </template>
            <EmptyState v-else compact :icon="Sun" :title="t('overview.todayEmpty')" :description="t('overview.todayEmptyHint')" />
          </div>
        </Card>

        <!-- Upcoming deadlines -->
        <Card :padded="false">
          <template #header>
            <div class="flex items-center gap-2">
              <CircleDot class="size-4 text-primary" aria-hidden="true" />
              <h2 class="text-[13px] font-semibold">{{ t('overview.upcoming') }}</h2>
            </div>
          </template>
          <template #actions>
            <Button variant="ghost" size="xs" @click="router.push('/upcoming')">{{ t('common.viewAll') }}<ArrowRight class="size-3.5" aria-hidden="true" /></Button>
          </template>
          <div class="px-4 pb-4">
            <Skeleton v-if="isPending" :rows="3" height="56px" />
            <ol v-else-if="deadlines.length" class="relative ml-1.5 border-l border-border">
              <li v-for="(task, i) in deadlines" :key="task.id" class="stagger relative py-2 pl-5" :style="{ '--i': i }">
                <span class="absolute -left-[5px] top-[18px] size-2.5 rounded-full ring-4 ring-surface" :class="task.risk.level === 'overdue' || task.risk.level === 'at_risk' ? 'bg-danger' : task.kind === 'deadline' ? 'bg-primary' : 'bg-border-strong'" aria-hidden="true" />
                <button type="button" class="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 text-left transition hover:bg-surface-hover" @click="ui.openTask(task.id)">
                  <span class="min-w-0 flex-1 truncate text-sm font-medium text-fg">{{ task.title }}</span>
                  <span class="flex items-center gap-2"><RiskBadge v-if="task.risk.level !== 'on_track'" :risk="task.risk" /><CountdownChip :due="task.due" /></span>
                </button>
              </li>
            </ol>
            <EmptyState v-else compact :icon="CircleDot" :title="t('overview.upcomingEmpty')" />
          </div>
        </Card>
      </div>

      <div class="flex min-w-0 flex-col gap-5">
        <!-- Needs attention -->
        <Card :padded="false" :class="(data?.attention.length ?? 0) > 0 ? 'border-danger/30' : ''">
          <template #header>
            <div class="flex items-center gap-2">
              <AlertTriangle class="size-4 text-danger" aria-hidden="true" />
              <h2 class="text-[13px] font-semibold">{{ t('overview.attention') }}</h2>
            </div>
          </template>
          <div class="px-1.5 pb-2">
            <Skeleton v-if="isPending" :rows="2" class="p-2" />
            <div v-else-if="data!.attention.length" role="list">
              <div v-for="task in data!.attention" :key="task.id" class="cursor-pointer rounded-xl px-3 py-2.5 transition hover:bg-surface-hover" role="listitem" @click="ui.openTask(task.id)">
                <p class="truncate text-sm font-medium text-fg">{{ task.title }}</p>
                <div class="mt-1"><RiskBadge :risk="task.risk" show-reason /></div>
              </div>
            </div>
            <EmptyState v-else compact :icon="CheckCircle2" :title="t('overview.attentionEmpty')" />
          </div>
        </Card>

        <!-- Goals -->
        <Card :padded="false">
          <template #header>
            <div class="flex items-center gap-2">
              <Target class="size-4 text-success" aria-hidden="true" />
              <h2 class="text-[13px] font-semibold">{{ t('overview.goals') }}</h2>
            </div>
          </template>
          <template #actions>
            <Button variant="ghost" size="xs" @click="router.push('/goals')">{{ t('common.viewAll') }}<ArrowRight class="size-3.5" aria-hidden="true" /></Button>
          </template>
          <div class="px-2 pb-2">
            <Skeleton v-if="isPending" :rows="2" height="52px" class="p-2" />
            <template v-else-if="data!.goals.length">
              <RouterLink v-for="g in data!.goals" :key="g.id" :to="`/goals/${g.id}`" class="flex items-center gap-3 rounded-xl px-2.5 py-2 transition hover:bg-surface-hover">
                <ProgressRing :value="g.health.actual * 100" :size="38" :tone="g.health.outlook === 'behind' ? 'warning' : 'success'" />
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-medium text-fg">{{ g.title }}</p>
                  <p class="truncate text-xs text-muted">{{ t(`goals.outlook.${g.health.outlook}`) }}<template v-if="g.targetDate"> · {{ f.date(g.targetDate, { short: true }) }}</template></p>
                </div>
              </RouterLink>
            </template>
            <EmptyState v-else compact :icon="Target" :title="t('overview.goalsEmpty')"><Button size="sm" @click="router.push('/goals?new=1')">{{ t('goals.new') }}</Button></EmptyState>
          </div>
        </Card>

        <!-- Recent progress -->
        <Card :padded="false">
          <template #header>
            <div class="flex items-center gap-2">
              <TrendingUp class="size-4 text-info" aria-hidden="true" />
              <h2 class="text-[13px] font-semibold">{{ t('overview.recent') }}</h2>
            </div>
          </template>
          <div class="px-4 pb-4">
            <Skeleton v-if="isPending" :rows="3" height="20px" />
            <ul v-else-if="data!.recentCheckpoints.length || data!.recentProgress.length" class="flex flex-col gap-2.5 text-[13px]">
              <li v-for="cp in data!.recentCheckpoints.slice(0, 4)" :key="cp.id" class="flex items-center gap-2">
                <CheckCircle2 class="size-3.5 shrink-0 text-success" aria-hidden="true" />
                <span class="min-w-0 flex-1 truncate text-fg">{{ cp.title }}</span>
                <span class="shrink-0 text-xs text-subtle">{{ cp.completedAt ? f.relativeTime(cp.completedAt, now) : '' }}</span>
              </li>
              <li v-for="p in data!.recentProgress.slice(0, 4)" :key="p.id" class="flex items-center gap-2">
                <TrendingUp class="size-3.5 shrink-0 text-info" aria-hidden="true" />
                <span class="min-w-0 flex-1 truncate text-fg">{{ p.title }}<span v-if="p.newValue != null" class="text-muted"> → {{ f.number(p.newValue) }}</span></span>
                <span class="shrink-0 text-xs text-subtle">{{ f.relativeTime(p.occurredAt, now) }}</span>
              </li>
            </ul>
            <p v-else class="py-3 text-center text-xs text-subtle">{{ t('overview.recentEmpty') }}</p>
            <div class="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-surface-sunken p-3 text-center">
              <div>
                <p class="tabular text-lg font-semibold">{{ data?.week.completed ?? 0 }}</p>
                <p class="text-[11px] text-muted">{{ t('overview.week.completed') }}</p>
              </div>
              <div>
                <p class="tabular text-lg font-semibold">{{ data?.week.dueSoon ?? 0 }}</p>
                <p class="text-[11px] text-muted">{{ t('overview.week.remaining') }}</p>
              </div>
              <div>
                <p class="tabular text-lg font-semibold">{{ data?.week.created ?? 0 }}</p>
                <p class="text-[11px] text-muted">{{ t('overview.week.created') }}</p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  </div>
</template>
