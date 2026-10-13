<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { AlertTriangle, Plus, Target } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'
import Segmented from '@/components/ui/Segmented.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import GoalCard from '@/components/goal/GoalCard.vue'
import GoalFormDialog from '@/components/goal/GoalFormDialog.vue'
import type { GoalPrefill } from '@/components/goal/goalFormat'
import { useGoals } from '@/composables/useTasks'

type GoalStatus = 'active' | 'paused' | 'completed' | 'archived'
const STATUSES: GoalStatus[] = ['active', 'paused', 'completed', 'archived']

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const status = ref<GoalStatus>('active')
const statusOptions = computed(() => STATUSES.map((value) => ({ value, label: t(`goalPage.status.${value}`) })))
const { data: goals, isPending, isError, refetch } = useGoals(() => ({ status: status.value }))

const formOpen = ref(false)
const prefill = ref<GoalPrefill | null>(null)

function openCreate(p: GoalPrefill | null = null) {
  prefill.value = p
  formOpen.value = true
}

// `/goals?new=1` opens the create dialog (used by other pages and deep links).
watch(
  () => route.query.new,
  (v) => {
    if (v === '1') {
      openCreate()
      router.replace({ query: {} })
    }
  },
  { immediate: true },
)

const examples = computed<{ id: string; title: string; prefill: GoalPrefill }[]>(() => [
  {
    id: 'books',
    title: t('goalPage.examples.books'),
    prefill: { title: t('goalPage.examples.books'), progressModel: 'quantity', targetValue: 10, unit: t('goalPage.examples.booksUnit') },
  },
  {
    id: 'study',
    title: t('goalPage.examples.study'),
    prefill: { title: t('goalPage.examples.study'), progressModel: 'time', targetValue: 40 },
  },
  {
    id: 'vue',
    title: t('goalPage.examples.vue'),
    prefill: { title: t('goalPage.examples.vue'), progressModel: 'percentage' },
  },
])
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div class="animate-fade-up">
        <h1 class="text-2xl font-semibold tracking-tight text-fg md:text-[28px]">{{ t('nav.goals') }}</h1>
        <p class="mt-1 text-[13px] text-muted">{{ t('goalPage.subtitle') }}</p>
      </div>
      <Button variant="primary" @click="openCreate()"><Plus class="size-4" aria-hidden="true" />{{ t('goals.new') }}</Button>
    </header>

    <div class="mt-6 flex overflow-x-auto">
      <Segmented v-model="status" :options="statusOptions" :label="t('goalPage.filterLabel')" size="sm" />
    </div>

    <!-- Loading -->
    <div v-if="isPending" class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
      <div v-for="i in 3" :key="i" class="skeleton h-40 rounded-2xl" />
    </div>

    <!-- Error -->
    <div v-else-if="isError" class="mt-8">
      <EmptyState :icon="AlertTriangle" :title="t('errors.loadFailed')" :description="t('errors.tryAgainHint')">
        <Button @click="refetch()">{{ t('common.retry') }}</Button>
      </EmptyState>
    </div>

    <!-- Empty -->
    <div v-else-if="!goals?.length" class="mt-6 rounded-2xl border border-dashed border-border-strong bg-surface p-2">
      <EmptyState
        :icon="Target"
        :title="status === 'active' ? t('goalPage.empty.title') : t('goalPage.emptyByStatus.title', { status: t(`goalPage.status.${status}`) })"
        :description="status === 'active' ? t('goalPage.empty.description') : t(`goalPage.emptyByStatus.${status}`)"
      >
        <template v-if="status === 'active'">
          <p class="mt-4 text-xs font-medium uppercase tracking-wide text-subtle">{{ t('goalPage.examples.heading') }}</p>
          <div class="mt-2 flex flex-wrap justify-center gap-2">
            <button
              v-for="ex in examples"
              :key="ex.id"
              type="button"
              class="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface-raised px-3 text-[13px] text-fg transition hover:border-border-strong hover:bg-surface-hover"
              @click="openCreate(ex.prefill)"
            >
              <Plus class="size-3.5 text-primary" aria-hidden="true" />{{ ex.title }}
            </button>
          </div>
          <Button class="mt-4" variant="secondary" size="sm" @click="openCreate()">{{ t('goalPage.empty.startBlank') }}</Button>
        </template>
      </EmptyState>
    </div>

    <!-- Grid -->
    <div v-else class="stagger mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div v-for="(g, i) in goals" :key="g.id" :style="{ '--i': i }" class="min-w-0">
        <GoalCard :goal="g" />
      </div>
    </div>

    <GoalFormDialog v-model:open="formOpen" :prefill="prefill" />
  </div>
</template>
