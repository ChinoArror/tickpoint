<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

/**
 * Renders the original text with evidence passages highlighted.
 * Matching is case-insensitive and tolerant of any whitespace between words.
 */
export interface Passage {
  key: string
  text: string
}

const props = defineProps<{ text: string; passages: Passage[]; focusKey: string | null }>()
const root = ref<HTMLElement | null>(null)

interface Segment {
  text: string
  key: string | null
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const segments = computed<Segment[]>(() => {
  const src = props.text
  const ranges: { start: number; end: number; key: string }[] = []
  for (const p of props.passages) {
    const words = p.text.trim().split(/\s+/).filter(Boolean)
    if (!words.length) continue
    const re = new RegExp(words.map(escapeRe).join('\\s+'), 'gi')
    for (const m of src.matchAll(re)) {
      const start = m.index ?? 0
      if (m[0].length) ranges.push({ start, end: start + m[0].length, key: p.key })
    }
  }
  ranges.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start))
  const out: Segment[] = []
  let pos = 0
  for (const r of ranges) {
    if (r.start < pos) continue
    if (r.start > pos) out.push({ text: src.slice(pos, r.start), key: null })
    out.push({ text: src.slice(r.start, r.end), key: r.key })
    pos = r.end
  }
  if (pos < src.length) out.push({ text: src.slice(pos), key: null })
  return out
})

watch(
  () => props.focusKey,
  async (key) => {
    if (!key) return
    await nextTick()
    const el = root.value?.querySelector<HTMLElement>(`[data-mark="${CSS.escape(key)}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  },
)
</script>

<template>
  <div ref="root" class="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-fg">
    <template v-for="(s, i) in segments" :key="i">
      <mark
        v-if="s.key"
        :data-mark="s.key"
        class="rounded-[4px] bg-primary-soft px-0.5 text-fg"
        :class="s.key === focusKey ? 'mark-focus bg-primary/35 ring-2 ring-primary/50' : ''"
      >{{ s.text }}</mark>
      <template v-else>{{ s.text }}</template>
    </template>
  </div>
</template>

<style scoped>
.mark-focus {
  animation: mark-pulse 1.4s var(--ease-out) 2;
}
@keyframes mark-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
  50% {
    box-shadow: 0 0 0 6px color-mix(in oklab, var(--color-primary) 18%, transparent);
  }
}
</style>
