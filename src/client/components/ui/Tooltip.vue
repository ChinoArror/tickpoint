<script setup lang="ts">
import { TooltipContent, TooltipPortal, TooltipRoot, TooltipTrigger } from 'reka-ui'

defineProps<{ text: string; side?: 'top' | 'bottom' | 'left' | 'right' }>()
</script>

<template>
  <TooltipRoot :delay-duration="350">
    <TooltipTrigger as-child><slot /></TooltipTrigger>
    <TooltipPortal>
      <TooltipContent :side="side ?? 'top'" :side-offset="6" class="menu-anim z-[80] max-w-xs rounded-lg bg-fg px-2 py-1 text-xs text-inverse shadow-md">{{ text }}</TooltipContent>
    </TooltipPortal>
  </TooltipRoot>
</template>
