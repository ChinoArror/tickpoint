<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Plus, Trash2 } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import EvidenceQuote from './EvidenceQuote.vue'
import type { ListRow } from './reviewModel'

/** Editable list (deliverables, requirements, rewards). Items are included by default. */
const props = defineProps<{
  items: ListRow[]
  evidencePrefix: string
  typeOptions?: { value: string; label: string }[]
  addLabel: string
  emptyLabel: string
  sectionLabel: string
}>()
const emit = defineEmits<{ add: []; remove: [key: string]; focusEvidence: [key: string] }>()
const { t } = useI18n()
</script>

<template>
  <div class="flex flex-col gap-2">
    <ul class="flex flex-col gap-2" :aria-label="sectionLabel">
      <li
        v-for="it in props.items"
        :key="it.key"
        class="rounded-xl border border-border bg-surface p-2.5 transition-opacity duration-200"
        :class="it.include ? '' : 'opacity-55'"
      >
        <div class="flex items-start gap-2">
          <input
            v-model="it.include"
            type="checkbox"
            class="mt-2.5 size-4 shrink-0 accent-[var(--color-primary)]"
            :aria-label="`${t('capture.review.list.include')}: ${it.text || sectionLabel}`"
          />
          <div class="flex min-w-0 flex-1 flex-col gap-2">
            <div class="flex flex-wrap gap-2">
              <Input v-model="it.text" class="min-w-0 flex-1" size="sm" :aria-label="t('capture.review.list.text')" :placeholder="t('capture.review.list.addPlaceholder')" />
              <Select v-if="typeOptions" v-model="it.type" class="w-full sm:w-44" size="sm" :options="typeOptions" :aria-label="t('capture.review.list.type')" />
            </div>
            <EvidenceQuote :text="it.evidence" :verified="it.evidenceVerified" compact @focus="emit('focusEvidence', `${evidencePrefix}:${it.key}`)" />
          </div>
          <IconButton :label="t('capture.review.list.remove')" @click="emit('remove', it.key)"><Trash2 /></IconButton>
        </div>
      </li>
    </ul>
    <p v-if="!props.items.length" class="text-xs text-subtle">{{ emptyLabel }}</p>
    <Button variant="ghost" size="sm" class="self-start" @click="emit('add')"><Plus aria-hidden="true" />{{ addLabel }}</Button>
  </div>
</template>
