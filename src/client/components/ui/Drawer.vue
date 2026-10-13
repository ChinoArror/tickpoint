<script setup lang="ts">
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, VisuallyHidden } from 'reka-ui'
import { useMediaQuery } from '@vueuse/core'

/** Side drawer on desktop; full-height bottom sheet on mobile. */
const open = defineModel<boolean>('open', { default: false })
withDefaults(defineProps<{ title: string; width?: string }>(), { width: '560px' })
const mobile = useMediaQuery('(max-width: 768px)')
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="overlay-anim fixed inset-0 z-40 bg-overlay" />
      <DialogContent
        class="fixed z-40 flex flex-col bg-surface-raised shadow-lg outline-none"
        :class="mobile ? 'sheet-bottom inset-x-0 bottom-0 top-[6dvh] rounded-t-[var(--radius-xl)] border-t border-border' : 'drawer-right inset-y-0 right-0 border-l border-border'"
        :style="mobile ? undefined : { width: `min(${width}, 100vw)` }"
      >
        <VisuallyHidden>
          <DialogTitle>{{ title }}</DialogTitle>
          <DialogDescription>{{ title }}</DialogDescription>
        </VisuallyHidden>
        <div v-if="mobile" class="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border-strong" aria-hidden="true" />
        <slot />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
