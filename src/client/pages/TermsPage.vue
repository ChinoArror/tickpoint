<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import PublicLayout from '@/layouts/PublicLayout.vue'
import { boldParts } from '@/content/docs'
import { terms } from '@/content/terms'
import { TERMS_VERSION } from '@shared/constants'

const { t, locale } = useI18n()
const lang = computed<'en' | 'ja'>(() => (locale.value === 'ja' ? 'ja' : 'en'))
const sections = computed(() => terms[lang.value])
// The effective date is the terms version (YYYY-MM-DD), formatted in UTC so it never shifts by time zone.
const effectiveDate = computed(() =>
  new Intl.DateTimeFormat(lang.value === 'ja' ? 'ja-JP' : 'en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${TERMS_VERSION}T00:00:00Z`)),
)
</script>

<template>
  <PublicLayout>
    <div class="mx-auto w-full max-w-3xl px-4 py-8 md:px-8 md:py-12">
      <header class="animate-fade-up">
        <h1 id="terms-title" class="text-2xl font-semibold tracking-tight text-fg md:text-[28px]">{{ t('termsPage.heading') }}</h1>
        <p class="mt-2 text-sm text-muted">{{ t('termsPage.effective', { date: effectiveDate }) }}</p>
        <p class="mt-3 text-sm">
          <RouterLink to="/privacy" class="font-medium text-primary-text underline-offset-4 hover:underline">{{ t('termsPage.privacyLink') }}</RouterLink>
        </p>
      </header>

      <nav :aria-label="t('docsPage.toc')" class="mt-8 rounded-xl border border-border bg-surface p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-subtle">{{ t('docsPage.toc') }}</p>
        <ol class="mt-3 grid gap-1.5 sm:grid-cols-2">
          <li v-for="(s, i) in sections" :key="s.id" class="text-sm">
            <a :href="`#${s.id}`" class="flex gap-2 rounded-md px-1.5 py-1 text-muted transition-colors hover:bg-surface-hover hover:text-fg"><span class="tabular text-subtle">{{ i + 1 }}.</span><span>{{ s.title }}</span></a>
          </li>
        </ol>
      </nav>

      <article aria-labelledby="terms-title" class="mt-8 space-y-10 md:space-y-12">
        <section v-for="s in sections" :id="s.id" :key="s.id" :aria-labelledby="`${s.id}-title`" class="scroll-mt-24">
          <h2 :id="`${s.id}-title`" tabindex="-1" class="text-lg font-semibold tracking-tight text-fg focus:outline-none md:text-xl">{{ s.title }}</h2>

          <p v-for="(p, i) in s.body" :key="`b${i}`" class="mt-3 text-[15px] leading-relaxed text-muted">
            <template v-for="(part, j) in boldParts(p)" :key="j"><strong v-if="part.bold" class="font-semibold text-fg">{{ part.text }}</strong><template v-else>{{ part.text }}</template></template>
          </p>

          <ul v-if="s.bullets?.length" class="mt-4 grid gap-2.5">
            <li v-for="(b, i) in s.bullets" :key="`l${i}`" class="flex gap-3 text-[15px] leading-relaxed text-muted">
              <span class="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden="true" />
              <span class="min-w-0">
                <template v-for="(part, j) in boldParts(b)" :key="j"><strong v-if="part.bold" class="font-semibold text-fg">{{ part.text }}</strong><template v-else>{{ part.text }}</template></template>
              </span>
            </li>
          </ul>
        </section>
      </article>
    </div>
  </PublicLayout>
</template>
