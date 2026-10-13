<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { Activity, Bell } from 'lucide-vue-next'
import Dialog from '@/components/ui/Dialog.vue'
import { MOBILE_NAV, NAV } from '@/layouts/nav'
import { useUiStore } from '@/stores/ui'

const { t } = useI18n()
const ui = useUiStore()
const open = computed({
  get: () => ui.moreSheetOpen,
  set: (v: boolean) => {
    ui.moreSheetOpen = v
  },
})

/** Destinations not already in the bottom bar, plus pages that have no nav entry. */
const destinations = computed(() => {
  const pinned = new Set(MOBILE_NAV.map((m) => m.to))
  return [
    ...NAV.filter((n) => !pinned.has(n.to)).map((n) => ({ to: n.to, key: n.key, label: t(`nav.${n.key}`), icon: n.icon })),
    { to: '/notifications', key: 'notifications', label: t('notifications.title'), icon: Bell },
    { to: '/activity', key: 'activity', label: t('activity.title'), icon: Activity },
  ]
})

function go() {
  ui.moreSheetOpen = false
}
</script>

<template>
  <Dialog v-model:open="open" :title="t('more.title')" :description="t('more.description')" size="md">
    <nav :aria-label="t('more.title')">
      <ul class="grid grid-cols-2 gap-3">
        <li v-for="d in destinations" :key="d.to">
          <RouterLink
            :to="d.to"
            class="flex min-h-24 flex-col items-center justify-center gap-2.5 rounded-2xl border border-border bg-surface p-4 text-center text-[13px] font-medium text-fg shadow-xs transition hover:bg-surface-hover active:scale-[0.97]"
            @click="go"
          >
            <span class="grid size-11 place-items-center rounded-xl bg-primary-softer text-primary-text"><component :is="d.icon" class="size-5" aria-hidden="true" /></span>
            {{ d.label }}
          </RouterLink>
        </li>
      </ul>
    </nav>
  </Dialog>
</template>
