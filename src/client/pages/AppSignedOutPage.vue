<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { CheckCircle2 } from 'lucide-vue-next'
import PublicLayout from '@/layouts/PublicLayout.vue'
import Button from '@/components/ui/Button.vue'

const { t } = useI18n()
const isAndroid = computed(() => typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent))
const intentUrl = 'intent://point.aryuki.com/app/signed-out#Intent;scheme=https;package=com.aryuki.tickpoint;end'
</script>

<template>
  <PublicLayout>
    <div class="mx-auto flex w-full max-w-sm animate-fade-up flex-col items-center gap-5 px-6 py-16 text-center">
      <div class="grid size-12 place-items-center rounded-full bg-success-soft text-success-text" aria-hidden="true"><CheckCircle2 class="size-6" /></div>
      <h1 class="text-xl font-semibold tracking-tight text-fg">{{ t('nativePlatform.signedOut.title') }}</h1>
      <p class="text-sm leading-relaxed text-muted">{{ t('nativePlatform.signedOut.body') }}</p>
      <Button v-if="isAndroid" as="a" :href="intentUrl" variant="primary" size="lg" block>{{ t('nativePlatform.signedOut.button') }}</Button>
      <RouterLink to="/" class="text-sm font-medium text-primary-text hover:underline">{{ t('nativePlatform.signedOut.web') }}</RouterLink>
    </div>
  </PublicLayout>
</template>
