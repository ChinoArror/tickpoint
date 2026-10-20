<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { AlertTriangle, CheckCircle2, Smartphone } from 'lucide-vue-next'
import PublicLayout from '@/layouts/PublicLayout.vue'
import Button from '@/components/ui/Button.vue'

// Opened in the phone browser when the App Link did not open the app. Its only job is
// to hand the one-time code to the app. The code is never logged.
const CODE_PATTERN = /^[A-Za-z0-9_-]{20,200}$/
const { t } = useI18n()
const route = useRoute()

const code = typeof route.query.code === 'string' ? route.query.code : ''
const state = typeof route.query.state === 'string' ? route.query.state : ''
const valid = CODE_PATTERN.test(code) && CODE_PATTERN.test(state)
const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)

const intentUrl = computed(
  () =>
    `intent://point.aryuki.com/app/auth-complete?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}#Intent;scheme=https;package=com.aryuki.tickpoint;end`,
)

onMounted(() => {
  // The values are kept in memory above; take them out of the address bar and history.
  if (route.query.code !== undefined || route.query.state !== undefined) {
    try {
      history.replaceState(null, '', '/app/auth-complete')
    } catch {
      /* ignore */
    }
  }
})
</script>

<template>
  <PublicLayout>
    <div class="mx-auto flex w-full max-w-sm animate-fade-up flex-col items-center gap-5 px-6 py-16 text-center">
      <div class="grid size-12 place-items-center rounded-full bg-primary-soft text-primary-text" aria-hidden="true"><Smartphone class="size-6" /></div>
      <h1 class="text-xl font-semibold tracking-tight text-fg">{{ t('nativePlatform.authComplete.heading') }}</h1>

      <template v-if="!isAndroid">
        <p class="text-sm leading-relaxed text-muted">{{ t('nativePlatform.authComplete.desktop') }}</p>
      </template>
      <template v-else-if="!valid">
        <div class="grid size-10 place-items-center rounded-full bg-danger-soft text-danger-text" aria-hidden="true"><AlertTriangle class="size-5" /></div>
        <p class="text-sm leading-relaxed text-muted" role="alert">{{ t('nativePlatform.authComplete.invalid') }}</p>
      </template>
      <template v-else>
        <div class="grid size-10 place-items-center rounded-full bg-success-soft text-success-text" aria-hidden="true"><CheckCircle2 class="size-5" /></div>
        <p class="text-sm leading-relaxed text-muted">{{ t('nativePlatform.authComplete.body') }}</p>
        <Button as="a" :href="intentUrl" variant="primary" size="lg" block>{{ t('nativePlatform.authComplete.button') }}</Button>
        <p class="text-xs text-subtle">{{ t('nativePlatform.authComplete.closeHint') }}</p>
      </template>
    </div>
  </PublicLayout>
</template>
