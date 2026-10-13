<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { onKeyStroke, useMediaQuery } from '@vueuse/core'
import { MoreHorizontal, PanelLeftClose, PanelLeftOpen, Plus, Search } from 'lucide-vue-next'
import Logo from '@/components/brand/Logo.vue'
import Kbd from '@/components/ui/Kbd.vue'
import TopBarActions from './TopBarActions.vue'
import { MOBILE_NAV, NAV } from './nav'
import { useUiStore } from '@/stores/ui'
import { useProjects } from '@/composables/useTasks'

const TaskDrawer = defineAsyncComponent(() => import('@/components/task/TaskDrawer.vue'))
const QuickAdd = defineAsyncComponent(() => import('@/components/task/QuickAddDialog.vue'))
const SearchPalette = defineAsyncComponent(() => import('@/components/shell/SearchPalette.vue'))
const MoreSheet = defineAsyncComponent(() => import('@/components/shell/MoreSheet.vue'))

const { t } = useI18n()
const route = useRoute()
const ui = useUiStore()
const desktop = useMediaQuery('(min-width: 768px)')
const { data: projects } = useProjects()
const collapsed = computed(() => desktop.value && ui.sidebarCollapsed)
const groups = computed(() => ({ main: NAV.filter((n) => n.group === 'main'), plan: NAV.filter((n) => n.group === 'plan'), insight: NAV.filter((n) => n.group === 'insight') }))
const isActive = (to: string) => (to === '/' ? route.path === '/' : route.path === to || route.path.startsWith(to + '/'))

function typing(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
}
onKeyStroke(['k', 'K'], (e) => {
  if (e.metaKey || e.ctrlKey) {
    e.preventDefault()
    ui.searchOpen = true
  }
})
onKeyStroke('q', (e) => {
  if (!typing(e) && !e.metaKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault()
    ui.openQuickAdd()
  }
})
</script>

<template>
  <div class="flex min-h-dvh">
    <a href="#main" class="sr-only z-[90] rounded-md bg-primary px-3 py-2 text-on-primary focus:not-sr-only focus:fixed focus:left-3 focus:top-3">{{ t('a11y.skipToContent') }}</a>

    <!-- Desktop sidebar -->
    <aside
      v-if="desktop"
      class="sticky top-0 flex h-dvh shrink-0 flex-col border-r border-border bg-bg-subtle transition-[width] duration-300 ease-[var(--ease-out)]"
      :style="{ width: collapsed ? '64px' : 'var(--sidebar-w)' }"
      :aria-label="t('a11y.mainNavigation')"
    >
      <div class="flex h-[var(--topbar-h)] items-center justify-between px-3.5">
        <RouterLink to="/" class="rounded-lg" :aria-label="t('nav.overview')"><Logo :wordmark="!collapsed" /></RouterLink>
        <button v-if="!collapsed" type="button" class="grid size-7 place-items-center rounded-md text-subtle transition hover:bg-surface-hover hover:text-fg" :aria-label="t('a11y.collapseSidebar')" @click="ui.toggleSidebar()">
          <PanelLeftClose class="size-4" />
        </button>
      </div>

      <div class="px-3 pb-2">
        <button
          type="button"
          class="flex h-9 w-full items-center gap-2 rounded-[10px] bg-primary px-3 text-sm font-medium text-on-primary shadow-sm transition hover:bg-primary-hover active:scale-[0.98]"
          :class="collapsed && 'justify-center px-0'"
          :aria-label="t('actions.quickAdd')"
          @click="ui.openQuickAdd()"
        >
          <Plus class="size-4" aria-hidden="true" />
          <span v-if="!collapsed" class="flex-1 text-left">{{ t('actions.quickAdd') }}</span>
          <Kbd v-if="!collapsed" class="border-white/20 bg-white/15 text-white/90">Q</Kbd>
        </button>
      </div>

      <nav class="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <template v-for="(items, g) in groups" :key="g">
          <p v-if="!collapsed && g !== 'main'" class="px-2.5 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-subtle">{{ t(`nav.group.${g}`) }}</p>
          <div v-else-if="g !== 'main'" class="mx-3 my-3 h-px bg-border" />
          <RouterLink
            v-for="item in items"
            :key="item.to"
            :to="item.to"
            class="group relative my-px flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors duration-150"
            :class="[isActive(item.to) ? 'bg-surface text-fg shadow-xs ring-1 ring-border' : 'text-muted hover:bg-surface-hover hover:text-fg', collapsed && 'justify-center px-0']"
            :aria-current="isActive(item.to) ? 'page' : undefined"
            :title="collapsed ? t(`nav.${item.key}`) : undefined"
          >
            <component :is="item.icon" class="size-4 shrink-0 transition-colors" :class="isActive(item.to) ? (item.key === 'capture' ? 'text-ai' : 'text-primary') : ''" aria-hidden="true" />
            <span v-if="!collapsed" class="truncate">{{ t(`nav.${item.key}`) }}</span>
            <span v-if="collapsed" class="sr-only">{{ t(`nav.${item.key}`) }}</span>
          </RouterLink>
          <template v-if="g === 'plan' && !collapsed && projects?.length">
            <RouterLink
              v-for="p in projects.slice(0, 8)"
              :key="p.id"
              :to="`/projects/${p.id}`"
              class="my-px ml-3 flex h-7 items-center gap-2 rounded-md px-2.5 text-[13px] text-muted transition hover:bg-surface-hover hover:text-fg"
              active-class="!text-fg bg-surface-hover"
            >
              <span class="size-2 shrink-0 rounded-full" :style="{ background: p.color ?? 'var(--primary)' }" aria-hidden="true" />
              <span class="truncate">{{ p.name }}</span>
            </RouterLink>
          </template>
        </template>
      </nav>

      <div v-if="collapsed" class="p-3">
        <button type="button" class="grid size-9 place-items-center rounded-lg text-subtle hover:bg-surface-hover hover:text-fg" :aria-label="t('a11y.expandSidebar')" @click="ui.toggleSidebar()">
          <PanelLeftOpen class="size-4" />
        </button>
      </div>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <!-- Top bar -->
      <header class="sticky top-0 z-30 flex h-[var(--topbar-h)] items-center gap-2 border-b border-border bg-bg/80 px-3 backdrop-blur-xl md:px-5">
        <RouterLink v-if="!desktop" to="/" class="mr-1"><Logo :size="26" :wordmark="false" /></RouterLink>
        <button
          type="button"
          class="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-border bg-surface px-3 text-[13px] text-subtle shadow-xs transition hover:border-border-strong md:max-w-md"
          :aria-label="t('search.open')"
          @click="ui.searchOpen = true"
        >
          <Search class="size-4 shrink-0" aria-hidden="true" />
          <span class="truncate">{{ t('search.placeholder') }}</span>
          <span class="ml-auto hidden gap-0.5 sm:flex"><Kbd>Ctrl</Kbd><Kbd>K</Kbd></span>
        </button>
        <div class="flex-1 max-md:hidden" />
        <TopBarActions />
      </header>

      <main id="main" class="min-w-0 flex-1 pb-[calc(84px+env(safe-area-inset-bottom))] md:pb-10" tabindex="-1">
        <RouterView v-slot="{ Component, route: r }">
          <Transition name="page" mode="out-in">
            <component :is="Component" :key="r.meta.transitionKey ?? r.path" />
          </Transition>
        </RouterView>
      </main>
    </div>

    <!-- Mobile bottom navigation -->
    <nav
      v-if="!desktop"
      class="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
      :aria-label="t('a11y.mainNavigation')"
    >
      <RouterLink
        v-for="item in MOBILE_NAV"
        :key="item.to"
        :to="item.to"
        class="flex h-16 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors"
        :class="isActive(item.to) || (item.key === 'tasks' && ['/inbox', '/upcoming', '/deadlines'].includes(route.path)) ? 'text-primary-text' : 'text-subtle'"
        :aria-current="isActive(item.to) ? 'page' : undefined"
      >
        <component :is="item.icon" class="size-[22px] transition-transform duration-300 ease-[var(--ease-spring)]" :class="isActive(item.to) && '-translate-y-0.5 scale-110'" aria-hidden="true" />
        {{ t(`mobileNav.${item.key}`) }}
      </RouterLink>
      <button type="button" class="flex h-16 flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-subtle" @click="ui.moreSheetOpen = true">
        <MoreHorizontal class="size-[22px]" aria-hidden="true" />
        {{ t('mobileNav.more') }}
      </button>
    </nav>

    <!-- Mobile quick-add FAB -->
    <button
      v-if="!desktop"
      type="button"
      class="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-4 z-30 grid size-14 place-items-center rounded-2xl bg-primary text-on-primary shadow-lg transition-transform duration-200 active:scale-90"
      :aria-label="t('actions.quickAdd')"
      @click="ui.openQuickAdd()"
    >
      <Plus class="size-6" />
    </button>

    <TaskDrawer v-if="ui.taskDrawerId" />
    <QuickAdd v-if="ui.quickAddOpen" />
    <SearchPalette v-if="ui.searchOpen" />
    <MoreSheet v-if="ui.moreSheetOpen" />
  </div>
</template>
