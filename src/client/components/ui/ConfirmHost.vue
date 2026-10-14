<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogOverlay, AlertDialogPortal, AlertDialogRoot, AlertDialogTitle } from 'reka-ui'
import { AlertTriangle } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { confirmState, settleConfirm } from '@/composables/useConfirm'
import Input from './Input.vue'

const { t } = useI18n()
const typed = ref('')
watch(() => confirmState.open, (o) => o && (typed.value = ''))
const canConfirm = computed(() => !confirmState.req?.typeToConfirm || typed.value.trim() === confirmState.req.typeToConfirm)
const open = computed({ get: () => confirmState.open, set: (v) => !v && settleConfirm(false) })
</script>

<template>
  <AlertDialogRoot v-model:open="open">
    <AlertDialogPortal>
      <AlertDialogOverlay class="overlay-anim fixed inset-0 z-[70] bg-overlay backdrop-blur-[2px]" />
      <AlertDialogContent class="dialog-anim fixed left-1/2 top-1/2 z-[70] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-xl)] border border-border bg-surface-raised p-5 shadow-lg outline-none">
        <div class="flex gap-3.5">
          <div v-if="confirmState.req?.danger" class="grid size-10 shrink-0 place-items-center rounded-full bg-danger-soft text-danger-text"><AlertTriangle class="size-5" aria-hidden="true" /></div>
          <div class="min-w-0 flex-1">
            <AlertDialogTitle class="text-[15px] font-semibold text-fg">{{ confirmState.req?.title }}</AlertDialogTitle>
            <AlertDialogDescription class="mt-1 text-[13px] leading-relaxed text-muted">{{ confirmState.req?.message ?? '' }}</AlertDialogDescription>
            <div v-if="confirmState.req?.typeToConfirm" class="mt-3">
              <label class="mb-1 block text-xs text-muted" for="confirm-type">{{ t('confirm.typeToConfirm', { word: confirmState.req.typeToConfirm }) }}</label>
              <Input id="confirm-type" v-model="typed" autocomplete="off" />
            </div>
          </div>
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <AlertDialogCancel class="h-9 rounded-[10px] border border-border bg-surface px-3.5 text-sm font-medium transition hover:bg-surface-hover" @click="settleConfirm(false)">
            {{ confirmState.req?.cancelLabel ?? t('common.cancel') }}
          </AlertDialogCancel>
          <!-- A plain button: AlertDialogAction closes the dialog before our click handler runs,
               and that close would settle the request as cancelled. -->
          <button
            type="button"
            :disabled="!canConfirm"
            class="h-9 rounded-[10px] px-3.5 text-sm font-medium shadow-sm transition disabled:opacity-50"
            :class="confirmState.req?.danger ? 'bg-danger text-white hover:opacity-90' : 'bg-primary text-on-primary hover:bg-primary-hover'"
            @click="settleConfirm(true)"
          >
            {{ confirmState.req?.confirmLabel ?? t('common.confirm') }}
          </button>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
