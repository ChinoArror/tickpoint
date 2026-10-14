<script setup lang="ts">
import { watch } from 'vue'
import { CheckCircle2, Info, X, XCircle } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { dismissToast, pauseToast, resumeToast, toasts, type Toast } from '@/composables/useToast'

type Hold = 'hover' | 'focus'

const { t } = useI18n()
const icons = { success: CheckCircle2, error: XCircle, info: Info }
const tones = { success: 'text-success', error: 'text-danger', info: 'text-primary' }
const bars = { success: 'bg-success/70', error: 'bg-danger/70', info: 'bg-primary/70' }

// The countdown pauses while the pointer is over a card or focus is inside it. Each
// reason is tracked separately so leaving one does not resume a card still held by the other.
const holds = new Map<number, Set<Hold>>()

function hold(id: number, why: Hold) {
  const set = holds.get(id) ?? new Set<Hold>()
  set.add(why)
  holds.set(id, set)
  pauseToast(id)
}

function release(id: number, why: Hold) {
  const set = holds.get(id)
  if (!set) return
  set.delete(why)
  if (set.size === 0) {
    holds.delete(id)
    resumeToast(id)
  }
}

function onFocusOut(id: number, e: FocusEvent) {
  const card = e.currentTarget as HTMLElement
  if (card.contains(e.relatedTarget as Node | null)) return
  release(id, 'focus')
}

watch(
  () => toasts.map((x) => x.id),
  (ids) => {
    for (const id of holds.keys()) if (!ids.includes(id)) holds.delete(id)
  },
)

async function act(toast: Toast) {
  // Start the action first so a deferred commit can see it was undone before the notice closes.
  const pending = toast.action?.run()
  dismissToast(toast.id)
  await pending
}
</script>

<template>
  <div class="flex w-full flex-col items-stretch gap-2 md:items-end" aria-live="polite" aria-relevant="additions">
    <TransitionGroup name="pop" tag="div" class="flex w-full flex-col items-stretch gap-2 md:items-end">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        :role="toast.kind === 'error' ? 'alert' : undefined"
        class="pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-[11px] border border-border/80 bg-surface-raised/95 shadow-[0_1px_2px_rgb(0_0_0/0.06),0_16px_36px_-18px_rgb(0_0_0/0.5)] backdrop-blur-xl"
        @pointerenter="hold(toast.id, 'hover')"
        @pointerleave="release(toast.id, 'hover')"
        @focusin="hold(toast.id, 'focus')"
        @focusout="onFocusOut(toast.id, $event)"
      >
        <div class="flex items-start gap-3 py-3 pl-3.5 pr-2.5">
          <component :is="icons[toast.kind]" class="mt-0.5 size-4 shrink-0" :class="tones[toast.kind]" aria-hidden="true" />
          <p class="line-clamp-2 min-w-0 flex-1 text-[13px] leading-snug text-fg">{{ toast.message }}</p>
          <button
            v-if="toast.action"
            type="button"
            class="shrink-0 rounded-md px-2 py-1 text-[13px] font-semibold text-primary-text transition hover:bg-primary-soft"
            @click="act(toast)"
          >{{ toast.action.label }}</button>
          <button
            type="button"
            class="-mr-0.5 grid size-6 shrink-0 place-items-center rounded-md text-subtle transition hover:bg-surface-hover hover:text-fg"
            :aria-label="t('common.dismiss')"
            @click="dismissToast(toast.id)"
          ><X class="size-3.5" aria-hidden="true" /></button>
        </div>
        <span
          class="toast-countdown pointer-events-none absolute inset-x-0 bottom-0 block h-[3px] motion-reduce:hidden"
          :class="bars[toast.kind]"
          :style="{ animationDuration: `${toast.timeout}ms`, animationPlayState: toast.paused ? 'paused' : 'running' }"
          aria-hidden="true"
        />
      </div>
    </TransitionGroup>
  </div>
</template>
