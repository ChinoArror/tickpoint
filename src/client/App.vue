<script setup lang="ts">
import { watchEffect, defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { TooltipProvider } from 'reka-ui'
import Toaster from '@/components/ui/Toaster.vue'
import ActivityHost from '@/components/ui/ActivityHost.vue'
import ConfirmHost from '@/components/ui/ConfirmHost.vue'
import { isNative } from '@/platform'

const PwaPrompt = defineAsyncComponent(() => import('@/components/shell/PwaPrompt.vue'))
const route = useRoute()
const { t } = useI18n()

watchEffect(() => {
  const key = route.meta.titleKey
  document.title = key ? `${t(key)} · TickPoint` : 'TickPoint'
})
</script>

<template>
  <TooltipProvider>
    <RouterView v-slot="{ Component }">
      <Transition name="fade" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
    <div class="pointer-events-none fixed inset-x-4 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-stretch gap-2 md:inset-x-auto md:bottom-6 md:right-6 md:w-96 md:items-end">
      <ActivityHost />
      <Toaster />
    </div>
    <ConfirmHost />
    <PwaPrompt v-if="!isNative" />
  </TooltipProvider>
</template>
