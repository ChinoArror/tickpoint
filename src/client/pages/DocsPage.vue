<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowRight } from 'lucide-vue-next'
import Dialog from '@/components/ui/Dialog.vue'
import PublicLayout from '@/layouts/PublicLayout.vue'
import { boldParts, docs, type DocsImage, type DocsSection } from '@/content/docs'

const { t, locale } = useI18n()
const lang = computed<'en' | 'ja'>(() => (locale.value === 'ja' ? 'ja' : 'en'))
const sections = computed(() => docs[lang.value])
const activeId = ref('')
const tocOpen = ref(false)
const zoom = ref<DocsImage | null>(null)
const zoomOpen = computed({
  get: () => zoom.value !== null,
  set: (open: boolean) => {
    if (!open) zoom.value = null
  },
})

function imagesOf(s: DocsSection): DocsImage[] {
  return [...(s.image ? [s.image] : []), ...(s.images ?? [])]
}
function src(img: DocsImage) {
  return `/docs-media/${lang.value}/${img.file}.jpg`
}
function dims(img: DocsImage) {
  return img.mobile ? { w: 780, h: 1688 } : { w: 1920, h: 1200 }
}

function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Jump to a section, moving focus to its heading. The router's scroll handler is not involved. */
function jump(e: MouseEvent, id: string) {
  const el = document.getElementById(id)
  if (!el) return
  e.preventDefault()
  el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' })
  el.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true })
  activeId.value = id
  tocOpen.value = false
  history.replaceState(history.state, '', `#${id}`)
}

let observer: IntersectionObserver | null = null
onMounted(() => {
  activeId.value = sections.value[0]?.id ?? ''
  if (typeof IntersectionObserver !== 'undefined') {
    const visible = new Set<string>()
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id)
          else visible.delete(entry.target.id)
        }
        // The topmost visible section wins.
        const first = sections.value.find((s) => visible.has(s.id))
        if (first) activeId.value = first.id
      },
      { rootMargin: '-80px 0px -60% 0px' },
    )
    for (const s of sections.value) {
      const el = document.getElementById(s.id)
      if (el) observer.observe(el)
    }
  }
  // Deep link such as /docs#inbox.
  const hash = window.location.hash.slice(1)
  if (hash) setTimeout(() => document.getElementById(hash)?.scrollIntoView({ block: 'start' }), 0)
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <PublicLayout>
    <div class="mx-auto w-full max-w-5xl px-4 py-8 md:px-8 md:py-12">
      <header class="animate-fade-up">
        <h1 id="docs-title" class="text-2xl font-semibold tracking-tight text-fg md:text-[28px]">{{ t('docsPage.heading') }}</h1>
        <p class="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">{{ t('docsPage.intro') }}</p>
      </header>

      <!-- Mobile: collapsible table of contents -->
      <details
        class="mt-6 rounded-xl border border-border bg-surface shadow-xs md:hidden"
        :open="tocOpen"
        @toggle="tocOpen = ($event.currentTarget as HTMLDetailsElement).open"
      >
        <summary class="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-sm font-medium text-fg">
          {{ t('docsPage.toc') }}
        </summary>
        <nav :aria-label="t('docsPage.toc')" class="border-t border-border p-2">
          <ol class="grid gap-0.5">
            <li v-for="s in sections" :key="s.id">
              <a
                :href="`#${s.id}`"
                class="block rounded-md px-2.5 py-2 text-[13px] text-muted transition-colors hover:bg-surface-hover hover:text-fg"
                :class="activeId === s.id && 'bg-primary-soft font-medium text-primary-text'"
                :aria-current="activeId === s.id ? 'location' : undefined"
                @click="jump($event, s.id)"
              >{{ s.title }}</a>
            </li>
          </ol>
        </nav>
      </details>

      <div class="mt-8 md:grid md:grid-cols-[200px_minmax(0,1fr)] md:gap-12">
        <!-- Desktop: sticky table of contents -->
        <aside class="hidden md:block">
          <nav :aria-label="t('docsPage.toc')" class="sticky top-24">
            <p class="mb-2 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-subtle">{{ t('docsPage.toc') }}</p>
            <ol class="grid gap-0.5">
              <li v-for="s in sections" :key="s.id">
                <a
                  :href="`#${s.id}`"
                  class="block rounded-md px-2.5 py-1.5 text-[13px] text-muted transition-colors hover:bg-surface-hover hover:text-fg"
                  :class="activeId === s.id && 'bg-primary-soft font-medium text-primary-text'"
                  :aria-current="activeId === s.id ? 'location' : undefined"
                  @click="jump($event, s.id)"
                >{{ s.title }}</a>
              </li>
            </ol>
          </nav>
        </aside>

        <article aria-labelledby="docs-title" class="min-w-0 space-y-14 md:space-y-16">
          <section v-for="s in sections" :id="s.id" :key="s.id" :aria-labelledby="`${s.id}-title`" class="scroll-mt-24">
            <h2 :id="`${s.id}-title`" tabindex="-1" class="text-xl font-semibold tracking-tight text-fg focus:outline-none md:text-[22px]">{{ s.title }}</h2>

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

            <div
              v-if="imagesOf(s).length"
              :class="imagesOf(s)[0]?.mobile ? 'mt-6 flex flex-wrap items-start justify-center gap-4 md:justify-start' : 'mt-6 grid gap-6'"
            >
              <figure v-for="img in imagesOf(s)" :key="img.file" :class="img.mobile ? 'w-full max-w-[260px]' : 'w-full'">
                <button
                  type="button"
                  class="group block w-full cursor-zoom-in rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                  :aria-label="`${t('docsPage.enlarge')}: ${img.alt}`"
                  @click="zoom = img"
                >
                  <img
                    :src="src(img)"
                    :width="dims(img).w"
                    :height="dims(img).h"
                    :alt="img.alt"
                    loading="lazy"
                    decoding="async"
                    class="block h-auto w-full rounded-xl border border-border shadow-sm transition duration-200 ease-[var(--ease-out)] group-hover:shadow-md"
                  />
                </button>
                <figcaption v-if="img.caption" class="mt-2 text-xs text-muted">{{ img.caption }}</figcaption>
              </figure>
            </div>

            <RouterLink
              v-if="s.id === 'data-privacy'"
              to="/privacy"
              class="mt-6 inline-flex min-h-9 items-center gap-1.5 rounded-lg text-[13px] font-medium text-primary-text underline-offset-4 hover:underline"
            >
              {{ t('docsPage.privacyLink') }}
              <ArrowRight class="size-4" aria-hidden="true" />
            </RouterLink>
          </section>
        </article>
      </div>
    </div>

    <Dialog v-model:open="zoomOpen" :title="t('docsPage.enlargeTitle')" size="xl">
      <img
        v-if="zoom"
        :src="src(zoom)"
        :alt="zoom.alt"
        :width="dims(zoom).w"
        :height="dims(zoom).h"
        class="mx-auto block h-auto max-h-[75dvh] w-auto max-w-full rounded-xl border border-border"
      />
    </Dialog>
  </PublicLayout>
</template>
