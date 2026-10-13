<script setup lang="ts">
import { nextTick, onMounted, ref, watch, type Component } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { cn } from '@/lib/cn'

/**
 * Horizontally scrollable pill links that stick under the top bar.
 * The active pill is scrolled into view whenever the route changes.
 */
const props = withDefaults(
  defineProps<{ items: { to: string; label: string; icon?: Component }[]; label: string; tone?: 'solid' | 'soft'; class?: string }>(),
  { tone: 'solid' },
)
const route = useRoute()
const root = ref<HTMLElement | null>(null)

function revealActive() {
  const nav = root.value
  const el = nav?.querySelector<HTMLElement>('[aria-current="page"]')
  if (!nav || !el) return
  const left = el.offsetLeft - (nav.clientWidth - el.offsetWidth) / 2
  nav.scrollTo({ left: Math.max(0, left), behavior: 'smooth' })
}

onMounted(() => nextTick(revealActive))
watch(
  () => route.path,
  () => nextTick(revealActive),
)
</script>

<template>
  <nav
    ref="root"
    :aria-label="label"
    :class="cn('sticky top-[var(--topbar-h)] z-20 -mx-4 flex gap-2 overflow-x-auto border-b border-border bg-bg/90 px-4 py-2 backdrop-blur-xl scrollbar-none', $props.class)"
  >
    <RouterLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      class="flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 text-[13px] font-medium text-muted transition-colors duration-150 hover:text-fg"
      :active-class="tone === 'solid' ? '!border-primary !bg-primary !text-on-primary' : '!border-primary !bg-primary-soft !text-primary-text'"
    >
      <component :is="item.icon" v-if="item.icon" class="size-4" aria-hidden="true" />
      {{ item.label }}
    </RouterLink>
  </nav>
</template>
