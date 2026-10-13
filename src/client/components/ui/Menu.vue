<script setup lang="ts">
import type { Component } from 'vue'
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel } from 'reka-ui'

export interface MenuItem {
  label?: string
  icon?: Component
  danger?: boolean
  disabled?: boolean
  separator?: boolean
  heading?: string
  shortcut?: string
  onSelect?: () => void
}
withDefaults(defineProps<{ items: MenuItem[]; align?: 'start' | 'center' | 'end'; width?: string }>(), { align: 'end', width: '200px' })
</script>

<template>
  <DropdownMenuRoot :modal="false">
    <DropdownMenuTrigger as-child><slot /></DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        :align="align"
        :side-offset="6"
        class="menu-anim z-50 rounded-xl border border-border bg-surface-raised p-1 shadow-lg"
        :style="{ minWidth: width }"
      >
        <template v-for="(item, i) in items" :key="i">
          <DropdownMenuSeparator v-if="item.separator" class="my-1 h-px bg-border" />
          <DropdownMenuLabel v-else-if="item.heading" class="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-subtle">{{ item.heading }}</DropdownMenuLabel>
          <DropdownMenuItem
            v-else
            :disabled="item.disabled"
            class="flex h-8 cursor-pointer select-none items-center gap-2 rounded-lg px-2 text-[13px] outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-surface-hover"
            :class="item.danger ? 'text-danger-text' : 'text-fg'"
            @select="item.onSelect?.()"
          >
            <component :is="item.icon" v-if="item.icon" class="size-4 shrink-0 opacity-80" aria-hidden="true" />
            <span class="flex-1 truncate">{{ item.label }}</span>
            <span v-if="item.shortcut" class="text-[11px] text-subtle">{{ item.shortcut }}</span>
          </DropdownMenuItem>
        </template>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
