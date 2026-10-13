<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import Logo from '@/components/brand/Logo.vue'
import Button from '@/components/ui/Button.vue'
import AppFooter from '@/components/shell/AppFooter.vue'
import { setLocale } from '@/i18n'

/** Shell for public, signed-out pages (help, privacy). */
const { t, locale } = useI18n()
const router = useRouter()
const current = computed(() => (locale.value === 'ja' ? 'ja' : 'en'))
const languages = [
  { value: 'en', label: 'docsPage.layout.english' },
  { value: 'ja', label: 'docsPage.layout.japanese' },
] as const
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-bg text-fg">
    <header class="sticky top-0 z-30 border-b border-border bg-bg/80 backdrop-blur-xl">
      <div class="mx-auto flex h-[var(--topbar-h)] w-full max-w-5xl items-center gap-3 px-4 md:px-8">
        <RouterLink to="/" class="shrink-0 rounded-lg" :aria-label="t('docsPage.layout.home')"><Logo :size="26" class="max-sm:[&>span:last-child]:hidden" /></RouterLink>
        <div class="flex-1" />
        <div role="group" :aria-label="t('docsPage.layout.language')" class="flex gap-0.5 rounded-lg bg-surface-sunken p-0.5 text-xs">
          <button
            v-for="l in languages"
            :key="l.value"
            type="button"
            class="min-h-7 whitespace-nowrap rounded-md px-2.5 font-medium transition"
            :class="current === l.value ? 'bg-surface text-fg shadow-xs' : 'text-muted hover:text-fg'"
            :aria-pressed="current === l.value"
            @click="setLocale(l.value, true)"
          >
            {{ t(l.label) }}
          </button>
        </div>
        <Button variant="primary" size="sm" class="shrink-0 whitespace-nowrap" @click="router.push('/')">{{ t('docsPage.layout.openApp') }}</Button>
      </div>
    </header>

    <main id="main" class="flex-1" tabindex="-1">
      <slot />
    </main>

    <AppFooter />
  </div>
</template>
