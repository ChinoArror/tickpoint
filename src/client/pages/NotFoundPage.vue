<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ArrowLeft, Compass, Home } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'

const { t } = useI18n()
const router = useRouter()

function back() {
  if (window.history.state?.back) router.back()
  else void router.push('/')
}
</script>

<template>
  <div class="flex min-h-[70dvh] flex-col items-center justify-center px-6 py-16 text-center">
    <div class="relative mb-8 animate-fade-up" aria-hidden="true">
      <div class="absolute inset-x-2 inset-y-4 -z-10 rounded-full bg-primary-softer blur-2xl" />
      <div class="grid size-28 place-items-center rounded-[2rem] border border-border bg-surface shadow-md">
        <Compass class="size-12 text-primary" />
      </div>
      <span class="tabular absolute -right-3 -top-3 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-muted shadow-xs">404</span>
      <span class="absolute -bottom-2 -left-4 size-3 rounded-full bg-ai-soft" />
      <span class="absolute -right-6 bottom-3 size-2 rounded-full bg-success-soft" />
    </div>

    <h1 class="text-2xl font-semibold tracking-tight text-fg">{{ t('notFound.title') }}</h1>
    <p class="mt-2 max-w-sm text-sm leading-relaxed text-muted">{{ t('notFound.description') }}</p>

    <div class="mt-8 flex flex-wrap items-center justify-center gap-2">
      <Button variant="primary" size="lg" @click="router.push('/')"><Home class="size-4" aria-hidden="true" />{{ t('notFound.backToOverview') }}</Button>
      <Button variant="ghost" size="lg" @click="back"><ArrowLeft class="size-4" aria-hidden="true" />{{ t('common.back') }}</Button>
    </div>
  </div>
</template>
