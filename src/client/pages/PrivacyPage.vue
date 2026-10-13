<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import PublicLayout from '@/layouts/PublicLayout.vue'
import { boldParts } from '@/content/docs'
import { privacy } from '@/content/privacy'

const { t, locale } = useI18n()
const sections = computed(() => privacy[locale.value === 'ja' ? 'ja' : 'en'])
</script>

<template>
  <PublicLayout>
    <div class="mx-auto w-full max-w-3xl px-4 py-8 md:px-8 md:py-12">
      <header class="animate-fade-up">
        <h1 id="privacy-title" class="text-2xl font-semibold tracking-tight text-fg md:text-[28px]">{{ t('privacyPage.heading') }}</h1>
        <p class="mt-2 text-sm text-muted">{{ t('privacyPage.effective') }}</p>
      </header>

      <article aria-labelledby="privacy-title" class="mt-8 space-y-10 md:space-y-12">
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
