<script setup lang="ts">
import { watchEffect, defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { TooltipProvider } from 'reka-ui'
import Toaster from '@/components/ui/Toaster.vue'
import ConfirmHost from '@/components/ui/ConfirmHost.vue'

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
    <Toaster />
    <ConfirmHost />
    <PwaPrompt />
  </TooltipProvider>
</template>
