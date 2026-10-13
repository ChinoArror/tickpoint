<script setup lang="ts">
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, VisuallyHidden } from 'reka-ui'
import { useMediaQuery } from '@vueuse/core'
import { X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { cn } from '@/lib/cn'

/**
 * Accessible modal. Centered dialog on desktop, bottom sheet on small screens.
 */
const open = defineModel<boolean>('open', { default: false })
withDefaults(defineProps<{ title: string; description?: string; size?: 'sm' | 'md' | 'lg' | 'xl'; hideTitle?: boolean; class?: string }>(), { size: 'md' })
const mobile = useMediaQuery('(max-width: 640px)')
const { t } = useI18n()
const widths = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="overlay-anim fixed inset-0 z-50 bg-overlay backdrop-blur-[2px]" />
      <DialogContent
        :class="
          cn(
            'fixed z-50 flex max-h-[min(88dvh,900px)] flex-col border border-border bg-surface-raised shadow-lg outline-none',
            mobile
              ? 'sheet-bottom inset-x-0 bottom-0 rounded-t-[var(--radius-xl)] pb-[env(safe-area-inset-bottom)]'
              : `dialog-anim left-1/2 top-[12vh] w-[calc(100vw-2rem)] -translate-x-1/2 rounded-[var(--radius-xl)] ${widths[size]}`,
            $props.class,
          )
        "
      >
        <div v-if="mobile" class="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border-strong" aria-hidden="true" />
        <header class="flex items-start justify-between gap-4 px-5 pt-4" :class="hideTitle ? 'pb-0' : 'pb-2'">
          <div class="min-w-0">
            <VisuallyHidden v-if="hideTitle"><DialogTitle>{{ title }}</DialogTitle></VisuallyHidden>
            <DialogTitle v-else class="text-[15px] font-semibold text-fg">{{ title }}</DialogTitle>
            <DialogDescription v-if="description" class="mt-0.5 text-[13px] text-muted">{{ description }}</DialogDescription>
            <VisuallyHidden v-else><DialogDescription>{{ title }}</DialogDescription></VisuallyHidden>
          </div>
          <DialogClose class="-mr-1.5 grid size-8 place-items-center rounded-lg text-subtle transition hover:bg-surface-hover hover:text-fg" :aria-label="t('common.close')">
            <X class="size-4" />
          </DialogClose>
        </header>
        <div class="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-1"><slot /></div>
        <footer v-if="$slots.footer" class="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3"><slot name="footer" /></footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
