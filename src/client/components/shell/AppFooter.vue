<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const year = new Date().getFullYear()
</script>

<template>
  <footer class="border-t border-border py-6 text-xs text-subtle">
    <div class="mx-auto flex w-full max-w-6xl flex-col items-center gap-3 px-4 text-center md:flex-row md:justify-between md:px-8 md:text-left">
      <div class="flex flex-col items-center gap-0.5 md:items-start">
        <p>{{ t('footer.rights', { year }) }}</p>
        <p>{{ t('footer.tagline') }}</p>
      </div>
      <nav :aria-label="t('footer.label')" class="flex items-center gap-1">
        <RouterLink to="/docs" class="inline-flex min-h-8 items-center rounded-md px-2.5 transition-colors hover:text-fg">{{ t('footer.help') }}</RouterLink>
        <RouterLink to="/privacy" class="inline-flex min-h-8 items-center rounded-md px-2.5 transition-colors hover:text-fg">{{ t('footer.privacy') }}</RouterLink>
      </nav>
    </div>
  </footer>
</template>
