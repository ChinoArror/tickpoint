<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useQueryClient } from '@tanstack/vue-query'
import Dialog from '@/components/ui/Dialog.vue'
import Button from '@/components/ui/Button.vue'
import Field from '@/components/ui/Field.vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'
import { api } from '@/lib/api'
import { useErrorMessage } from '@/composables/useTasks'
import { useToast } from '@/composables/useToast'
import { projectCreateSchema } from '@shared/schemas'
import type { Project } from '@/lib/types'
import { PROJECT_COLORS, PROJECT_COLOR_KEYS } from './projectActions'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ project?: Project | null }>()

const { t } = useI18n()
const qc = useQueryClient()
const toast = useToast()
const errMsg = useErrorMessage()

const isEdit = computed(() => !!props.project)
const name = ref('')
const description = ref('')
const color = ref<string>(PROJECT_COLORS[0])
const errors = ref<Record<string, string>>({})
const saving = ref(false)

watch(open, (v) => {
  if (!v) return
  errors.value = {}
  name.value = props.project?.name ?? ''
  description.value = props.project?.description ?? ''
  color.value = props.project?.color ?? PROJECT_COLORS[0]
})

const colorOptions = PROJECT_COLORS.map((value, i) => ({ value, key: PROJECT_COLOR_KEYS[i] }))

function submit() {
  if (saving.value) return
  const payload = {
    name: name.value.trim(),
    description: description.value.trim() || null,
    color: color.value,
  }
  const parsed = projectCreateSchema.safeParse(payload)
  if (!parsed.success) {
    const next: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'name')
      next[key] = t(`projects.form.errors.${issue.message === 'REQUIRED' ? 'REQUIRED' : 'INVALID'}`)
    }
    errors.value = next
    return
  }
  errors.value = {}
  saving.value = true
  const request = props.project ? api.patch<Project>(`/projects/${props.project.id}`, parsed.data) : api.post<Project>('/projects', parsed.data)
  request
    .then(() => {
      for (const key of ['projects', 'goals', 'dashboard']) qc.invalidateQueries({ queryKey: [key] })
      toast.success(isEdit.value ? t('toast.saved') : t('toast.created'))
      open.value = false
    })
    .catch((e) => toast.error(errMsg(e)))
    .finally(() => (saving.value = false))
}
</script>

<template>
  <Dialog v-model:open="open" :title="isEdit ? t('projects.form.editTitle') : t('projects.form.createTitle')" size="md">
    <form id="project-form" class="flex flex-col gap-4" novalidate @submit.prevent="submit">
      <Field :label="t('projects.form.name')" :error="errors.name" v-slot="{ id, describedby, invalid }">
        <Input :id="id" v-model="name" :aria-describedby="describedby" :invalid="invalid" :placeholder="t('projects.form.namePlaceholder')" maxlength="300" autocomplete="off" />
      </Field>

      <Field :label="t('projects.form.description')" :error="errors.description" optional :optional-label="t('common.optional')" v-slot="{ id, describedby, invalid }">
        <Textarea :id="id" v-model="description" :aria-describedby="describedby" :invalid="invalid" rows="2" />
      </Field>

      <Field :label="t('projects.form.color')" :error="errors.color" v-slot="{ id, describedby }">
        <div :id="id" role="radiogroup" :aria-describedby="describedby" :aria-label="t('projects.form.color')" class="flex flex-wrap gap-2">
          <button
            v-for="c in colorOptions"
            :key="c.value"
            type="button"
            role="radio"
            :aria-checked="color === c.value"
            :aria-label="t(`projects.colors.${c.key}`)"
            :title="t(`projects.colors.${c.key}`)"
            class="grid size-9 place-items-center rounded-full ring-offset-2 ring-offset-surface transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2"
            :class="color === c.value ? 'ring-2 ring-fg' : 'ring-0'"
            @click="color = c.value"
          >
            <span class="size-6 rounded-full" :style="{ backgroundColor: c.value }" aria-hidden="true" />
          </button>
        </div>
      </Field>
    </form>

    <template #footer>
      <Button variant="secondary" @click="open = false">{{ t('common.cancel') }}</Button>
      <Button type="submit" form="project-form" variant="primary" :loading="saving">{{ isEdit ? t('common.save') : t('common.create') }}</Button>
    </template>
  </Dialog>
</template>
