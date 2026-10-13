<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from 'reka-ui'

const model = defineModel<boolean>({ default: false })
defineProps<{ id?: string; disabled?: boolean; label?: string }>()
</script>

<template>
  <SwitchRoot
    :id="id"
    v-model="model"
    :disabled="disabled"
    :aria-label="label"
    class="relative inline-flex h-[22px] w-[38px] shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-border-strong transition-colors duration-200 data-[state=checked]:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
  >
    <SwitchThumb
      class="block size-[18px] translate-x-[1px] rounded-full bg-white shadow-sm transition-transform duration-300 ease-[var(--ease-spring)] data-[state=checked]:translate-x-[17px]"
    />
  </SwitchRoot>
</template>
