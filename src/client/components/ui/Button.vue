<script setup lang="ts">
import { computed } from 'vue'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'
import Spinner from './Spinner.vue'

const button = cva(
  'relative inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-[background-color,color,box-shadow,transform,opacity] duration-150 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-on-primary shadow-sm hover:bg-primary-hover',
        secondary: 'border border-border bg-surface text-fg shadow-xs hover:bg-surface-hover hover:border-border-strong',
        ghost: 'text-muted hover:bg-surface-hover hover:text-fg',
        soft: 'bg-primary-soft text-primary-text hover:bg-primary-soft/80',
        danger: 'bg-danger text-white shadow-sm hover:opacity-90',
        'danger-ghost': 'text-danger-text hover:bg-danger-soft',
        ai: 'bg-ai text-white shadow-sm hover:opacity-90',
      },
      size: {
        xs: 'h-7 rounded-md px-2 text-xs',
        sm: 'h-8 rounded-md px-2.5 text-[13px]',
        md: 'h-9 rounded-[10px] px-3.5 text-sm',
        lg: 'h-11 rounded-xl px-5 text-[15px]',
        icon: 'size-9 rounded-[10px]',
        'icon-sm': 'size-8 rounded-md',
      },
      block: { true: 'w-full' },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

type ButtonVariants = VariantProps<typeof button>

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariants['variant']
    size?: ButtonVariants['size']
    block?: boolean
    loading?: boolean
    disabled?: boolean
    type?: 'button' | 'submit' | 'reset'
    as?: string
    class?: string
  }>(),
  { type: 'button', as: 'button' },
)

const classes = computed(() => cn(button({ variant: props.variant, size: props.size, block: props.block }), props.class))
</script>

<template>
  <component :is="as" :type="as === 'button' ? type : undefined" :class="classes" :disabled="disabled || loading" :aria-busy="loading || undefined">
    <span v-if="loading" class="absolute inset-0 grid place-items-center"><Spinner class="size-4" /></span>
    <span class="inline-flex items-center gap-1.5" :class="loading ? 'invisible' : ''"><slot /></span>
  </component>
</template>
