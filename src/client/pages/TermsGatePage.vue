<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import Logo from '@/components/brand/Logo.vue'
import Button from '@/components/ui/Button.vue'
import { terms } from '@/content/terms'
import { native } from '@/platform'
import { safeReturnPath } from '@/platform/terms'
import { TERMS_VERSION } from '@shared/constants'

// Android only (the router guard sends here until the current Terms are accepted).
// No permission requests happen on this page.
const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const agreed = ref(false)
const declining = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)
const target = computed(() => safeReturnPath(route.query.return))
const sections = computed(() => terms[locale.value === 'ja' ? 'ja' : 'en'])

/** Text only, with **bold** markers. Never v-html. */
function segments(text: string): { text: string; bold: boolean }[] {
  return text
    .split(/(\*\*[^*]+\*\*)/)
    .filter((p) => p !== '')
    .map((p) => (p.startsWith('**') && p.endsWith('**') ? { text: p.slice(2, -2), bold: true } : { text: p, bold: false }))
}

async function accept() {
  if (!native || !agreed.value || busy.value) return
  busy.value = true
  error.value = null
  try {
    await native.terms.accept(TERMS_VERSION)
    await router.replace(target.value)
  } catch {
    error.value = t('nativePlatform.terms.acceptFailed')
  } finally {
    busy.value = false
  }
}

async function closeApp() {
  await native?.terms.decline().catch(() => undefined)
}
</script>

<template>
  <div class="grid min-h-dvh place-items-center bg-bg px-6 py-10 text-fg">
    <main id="main" class="flex w-full max-w-sm animate-fade-up flex-col gap-6">
      <Logo :size="40" class="self-center" />
      <div class="text-center">
        <h1 class="text-2xl font-semibold tracking-tight">{{ t('nativePlatform.terms.gateTitle') }}</h1>
        <p class="mt-2 text-sm leading-relaxed text-muted">{{ t('nativePlatform.terms.summary') }}</p>
      </div>

      <section
        class="max-h-72 overflow-y-auto rounded-xl border border-border bg-surface-sunken p-4 text-sm leading-relaxed text-muted"
        tabindex="0"
        :aria-label="t('nativePlatform.terms.readFull')"
      >
        <article v-for="s in sections" :key="s.id" class="mb-4 last:mb-0">
          <h2 class="mb-1.5 text-[13px] font-semibold text-fg">{{ s.title }}</h2>
          <p v-for="(b, i) in s.body" :key="i" class="mb-2 last:mb-0">
            <template v-for="(seg, j) in segments(b)" :key="j"><strong v-if="seg.bold" class="font-semibold text-fg">{{ seg.text }}</strong><template v-else>{{ seg.text }}</template></template>
          </p>
          <ul v-if="s.bullets?.length" class="mb-2 list-disc pl-5">
            <li v-for="(b, i) in s.bullets" :key="i">{{ b }}</li>
          </ul>
        </article>
      </section>

      <p class="text-center text-sm">
        <RouterLink to="/terms" class="font-medium text-primary-text hover:underline">{{ t('nativePlatform.terms.readFull') }}</RouterLink>
        <span class="text-subtle"> · </span>
        <RouterLink to="/privacy" class="font-medium text-primary-text hover:underline">{{ t('nativePlatform.terms.privacy') }}</RouterLink>
      </p>

      <template v-if="!declining">
        <label class="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface p-4 text-sm leading-relaxed">
          <input v-model="agreed" type="checkbox" class="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]" />
          <span>{{ t('nativePlatform.terms.agree') }}</span>
        </label>
        <p v-if="error" class="text-sm text-danger-text" role="alert">{{ error }}</p>
        <div class="flex flex-col gap-2.5">
          <Button variant="primary" size="lg" block :disabled="!agreed" :loading="busy" @click="accept">{{ t('nativePlatform.terms.accept') }}</Button>
          <Button variant="ghost" block @click="declining = true">{{ t('nativePlatform.terms.decline') }}</Button>
        </div>
      </template>

      <section v-else class="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 text-center" role="alert">
        <p class="text-sm font-medium">{{ t('nativePlatform.terms.declineTitle') }}</p>
        <div class="flex flex-col gap-2.5">
          <Button variant="primary" block @click="declining = false">{{ t('nativePlatform.terms.reviewAgain') }}</Button>
          <Button variant="secondary" block @click="closeApp">{{ t('nativePlatform.terms.closeApp') }}</Button>
        </div>
      </section>
    </main>
  </div>
</template>
