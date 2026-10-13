<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { AlertTriangle } from 'lucide-vue-next'
import Logo from '@/components/brand/Logo.vue'
import Button from '@/components/ui/Button.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { api, ApiError } from '@/lib/api'
import { useSessionStore } from '@/stores/session'
import { i18n } from '@/i18n'

const { t } = useI18n()
const router = useRouter()
const session = useSessionStore()
const error = ref<string | null>(null)

onMounted(async () => {
  // Read the JWT, then remove it from the address bar and history immediately.
  const params = new URLSearchParams(location.search)
  const token = params.get('token')
  history.replaceState(null, '', '/sso-callback')
  if (!token) {
    error.value = t('auth.missingToken')
    return
  }
  try {
    const r = await api.post<{ redirect: string }>('/auth/session', {
      token,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: i18n.global.locale.value,
    })
    try {
      localStorage.setItem('tp.hadSession', '1')
    } catch {
      /* ignore */
    }
    await session.load()
    router.replace(r.redirect || '/')
  } catch (e) {
    const reason = e instanceof ApiError ? ((e.details as { reason?: string } | undefined)?.reason ?? e.code) : 'network'
    error.value = t(`auth.callbackError.${reason}`, t('auth.callbackError.default'))
  }
})
</script>

<template>
  <div class="grid min-h-dvh place-items-center bg-bg px-6">
    <div class="flex w-full max-w-sm animate-fade-up flex-col items-center gap-5 text-center">
      <Logo :size="40" />
      <template v-if="!error">
        <Spinner class="size-6 text-primary" />
        <p class="text-sm text-muted" role="status">{{ t('auth.signingIn') }}</p>
      </template>
      <template v-else>
        <div class="grid size-12 place-items-center rounded-full bg-danger-soft text-danger-text"><AlertTriangle class="size-6" aria-hidden="true" /></div>
        <p class="text-sm text-fg" role="alert">{{ error }}</p>
        <Button variant="primary" @click="router.replace('/signin')">{{ t('auth.tryAgain') }}</Button>
      </template>
    </div>
  </div>
</template>
