<script setup lang="ts">
import { CheckCircle2, Info, X, XCircle } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { dismissToast, toasts, type Toast } from '@/composables/useToast'

const { t } = useI18n()
const icons = { success: CheckCircle2, error: XCircle, info: Info }
const tones = { success: 'text-success', error: 'text-danger', info: 'text-primary' }

async function act(toast: Toast) {
  dismissToast(toast.id)
  await toast.action?.run()
}
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:px-6" aria-live="polite" role="status">
    <TransitionGroup name="pop">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border border-border bg-surface-raised py-2.5 pl-3 pr-2 text-[13px] shadow-lg"
      >
        <component :is="icons[toast.kind]" class="size-4 shrink-0" :class="tones[toast.kind]" aria-hidden="true" />
        <p class="min-w-0 flex-1 text-fg">{{ toast.message }}</p>
        <button v-if="toast.action" type="button" class="rounded-md px-2 py-1 text-[13px] font-semibold text-primary-text transition hover:bg-primary-soft" @click="act(toast)">{{ toast.action.label }}</button>
        <button type="button" class="grid size-6 place-items-center rounded-md text-subtle transition hover:bg-surface-hover hover:text-fg" :aria-label="t('common.dismiss')" @click="dismissToast(toast.id)"><X class="size-3.5" /></button>
      </div>
    </TransitionGroup>
  </div>
</template>
