<script setup lang="ts">
import { computed, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useMediaQuery } from '@vueuse/core'
import { Bell, CheckCircle2, Database, Loader2, SlidersHorizontal, Sparkles, UserRound, ListChecks } from 'lucide-vue-next'
import PillNav from '@/components/mobile/PillNav.vue'
import GeneralSection from '@/components/settings/GeneralSection.vue'
import TasksSection from '@/components/settings/TasksSection.vue'
import NotificationsSection from '@/components/settings/NotificationsSection.vue'
import AiSection from '@/components/settings/AiSection.vue'
import AccountSection from '@/components/settings/AccountSection.vue'
import DataSection from '@/components/settings/DataSection.vue'
import { saveState } from '@/components/settings/useSettingSave'

type SectionKey = 'general' | 'tasks' | 'notifications' | 'ai' | 'account' | 'data'

const props = defineProps<{ section: SectionKey }>()
const { t } = useI18n()

const sections: { key: SectionKey; icon: Component; component: Component }[] = [
  { key: 'general', icon: SlidersHorizontal, component: GeneralSection },
  { key: 'tasks', icon: ListChecks, component: TasksSection },
  { key: 'notifications', icon: Bell, component: NotificationsSection },
  { key: 'ai', icon: Sparkles, component: AiSection },
  { key: 'account', icon: UserRound, component: AccountSection },
  { key: 'data', icon: Database, component: DataSection },
]
const current = computed(() => sections.find((s) => s.key === props.section) ?? sections[0])
const desktop = useMediaQuery('(min-width: 768px)')
const mobileItems = computed(() => sections.map((s) => ({ to: `/settings/${s.key}`, label: t(`settingsPage.sections.${s.key}`), icon: s.icon })))
</script>

<template>
  <div class="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8">
    <header class="flex flex-wrap items-center justify-between gap-3 animate-fade-up">
      <h1 class="text-2xl font-semibold tracking-tight text-fg">{{ t('nav.settings') }}</h1>
      <p class="inline-flex h-6 items-center gap-1.5 text-xs text-muted" aria-live="polite">
        <Transition name="fade" mode="out-in">
          <span v-if="saveState.status === 'saving'" key="saving" class="inline-flex items-center gap-1.5"><Loader2 class="size-3.5 animate-spin" aria-hidden="true" />{{ t('common.saving') }}</span>
          <span v-else-if="saveState.status === 'saved'" key="saved" class="inline-flex items-center gap-1.5 text-success-text"><CheckCircle2 class="size-3.5" aria-hidden="true" />{{ t('common.saved') }}</span>
        </Transition>
      </p>
    </header>

    <div class="mt-6 flex flex-col gap-6 md:flex-row md:gap-10">
      <!-- Mobile: sticky horizontal pill navigation -->
      <PillNav v-if="!desktop" tone="soft" :items="mobileItems" :label="t('settingsPage.navLabel')" />


      <!-- Desktop: vertical section navigation -->
      <nav class="sticky top-[calc(var(--topbar-h)+1.5rem)] hidden h-fit w-52 shrink-0 flex-col gap-0.5 self-start md:flex" :aria-label="t('settingsPage.navLabel')">
        <RouterLink
          v-for="s in sections"
          :key="s.key"
          :to="`/settings/${s.key}`"
          class="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-fg"
          active-class="!bg-surface !text-fg shadow-xs ring-1 ring-border"
        >
          <component :is="s.icon" class="size-4 shrink-0" :class="current.key === s.key ? 'text-primary' : ''" aria-hidden="true" />
          {{ t(`settingsPage.sections.${s.key}`) }}
        </RouterLink>
      </nav>

      <div class="min-w-0 flex-1">
        <Transition name="fade" mode="out-in">
          <component :is="current.component" :key="current.key" />
        </Transition>
      </div>
    </div>
  </div>
</template>
