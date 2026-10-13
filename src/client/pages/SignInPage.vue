<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ArrowRight, CalendarClock, ListChecks, Sparkles, Target } from 'lucide-vue-next'
import Logo from '@/components/brand/Logo.vue'
import Button from '@/components/ui/Button.vue'
import { api, startSignIn } from '@/lib/api'
import { useSessionStore } from '@/stores/session'
import { setLocale } from '@/i18n'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const devLoading = ref(false)
const returnTo = computed(() => (typeof route.query.return === 'string' ? route.query.return : '/'))
const notice = computed(() => (route.query.error === 'loop' ? t('auth.loopError') : route.query.signedOut ? t('auth.signedOut') : null))

onMounted(() => {
  session.loadConfig().catch(() => undefined)
})

function signIn() {
  startSignIn(returnTo.value)
}

async function devSignIn(user: 'alice' | 'bob') {
  devLoading.value = true
  try {
    await api.post('/auth/dev-login', { user, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, locale: locale.value })
    localStorage.setItem('tp.hadSession', '1')
    await session.load()
    router.replace(returnTo.value)
  } finally {
    devLoading.value = false
  }
}

const features = [
  { icon: Sparkles, key: 'capture' },
  { icon: CalendarClock, key: 'deadlines' },
  { icon: ListChecks, key: 'checkpoints' },
  { icon: Target, key: 'goals' },
]
</script>

<template>
  <div class="relative grid min-h-dvh overflow-hidden bg-bg lg:grid-cols-[1.05fr_1fr]">
    <!-- Left: brand panel -->
    <section class="relative hidden overflow-hidden border-r border-border bg-surface-sunken lg:flex lg:flex-col lg:justify-between lg:p-12">
      <div class="pointer-events-none absolute -left-24 -top-24 size-[420px] rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
      <div class="pointer-events-none absolute -bottom-32 right-0 size-[360px] rounded-full bg-ai/10 blur-3xl" aria-hidden="true" />
      <Logo :size="32" />
      <div class="relative max-w-md">
        <h1 class="text-[34px] font-semibold leading-[1.15] tracking-tight text-fg">{{ t('brand.tagline') }}</h1>
        <p class="mt-3 text-[15px] leading-relaxed text-muted">{{ t('brand.pitch') }}</p>
        <ul class="stagger mt-8 grid gap-3">
          <li v-for="(f, i) in features" :key="f.key" class="flex items-start gap-3 rounded-xl border border-border bg-surface/70 p-3 backdrop-blur" :style="{ '--i': i }">
            <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary-text"><component :is="f.icon" class="size-4" aria-hidden="true" /></span>
            <span>
              <span class="block text-[13px] font-semibold text-fg">{{ t(`brand.features.${f.key}.title`) }}</span>
              <span class="block text-xs text-muted">{{ t(`brand.features.${f.key}.body`) }}</span>
            </span>
          </li>
        </ul>
      </div>
      <p class="text-xs text-subtle">© TickPoint</p>
    </section>

    <!-- Right: sign-in -->
    <section class="flex flex-col items-center justify-center px-6 py-16">
      <div class="absolute right-4 top-4 flex gap-1 rounded-lg bg-surface-sunken p-0.5 text-xs">
        <button v-for="l in ['en', 'ja'] as const" :key="l" type="button" class="rounded-md px-2.5 py-1 font-medium transition" :class="locale === l ? 'bg-surface text-fg shadow-xs' : 'text-muted'" @click="setLocale(l, true)">
          {{ l === 'en' ? 'English' : '日本語' }}
        </button>
      </div>
      <div class="w-full max-w-sm animate-fade-up">
        <Logo class="mb-10 lg:hidden" :size="36" />
        <h2 class="text-2xl font-semibold tracking-tight text-fg">{{ t('auth.welcome') }}</h2>
        <p class="mt-1.5 text-sm text-muted">{{ t('auth.signInHint') }}</p>

        <Transition name="fade">
          <p v-if="notice" class="mt-5 rounded-lg border border-border bg-surface-sunken px-3 py-2 text-[13px] text-muted" role="status">{{ notice }}</p>
        </Transition>

        <Button variant="primary" size="lg" block class="group mt-8" @click="signIn">
          {{ t('auth.continueWithAccounts') }}
          <ArrowRight class="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Button>
        <p class="mt-3 text-center text-xs text-subtle">{{ t('auth.accountsNote') }}</p>

        <div v-if="session.config?.devBypass" class="mt-10 rounded-xl border border-dashed border-warning/60 bg-warning-soft/40 p-3">
          <p class="mb-2 text-xs font-medium text-warning-text">{{ t('auth.devOnly') }}</p>
          <div class="flex gap-2">
            <Button size="sm" :loading="devLoading" @click="devSignIn('alice')">Alice</Button>
            <Button size="sm" :loading="devLoading" @click="devSignIn('bob')">Bob</Button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
