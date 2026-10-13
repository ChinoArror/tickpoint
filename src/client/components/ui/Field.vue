<script setup lang="ts">
import { useId } from 'vue'

const props = defineProps<{ label?: string; hint?: string; error?: string | null; optional?: boolean; optionalLabel?: string; id?: string }>()
const fieldId = props.id ?? useId()
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label v-if="label" :for="fieldId" class="flex items-baseline justify-between text-[13px] font-medium text-fg">
      <span>{{ label }}</span>
      <span v-if="optional" class="text-xs font-normal text-subtle">{{ optionalLabel }}</span>
    </label>
    <slot :id="fieldId" :describedby="error ? `${fieldId}-err` : hint ? `${fieldId}-hint` : undefined" :invalid="!!error" />
    <p v-if="error" :id="`${fieldId}-err`" class="animate-fade-in text-xs text-danger-text" role="alert">{{ error }}</p>
    <p v-else-if="hint" :id="`${fieldId}-hint`" class="text-xs text-subtle">{{ hint }}</p>
  </div>
</template>
