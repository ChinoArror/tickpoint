<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'
import TaskDetailView from '@/components/task/TaskDetailView.vue'

defineProps<{ id: string }>()
const { t } = useI18n()
const router = useRouter()

function goBack() {
  if (window.history.state?.back) router.back()
  else router.push('/inbox')
}
</script>

<template>
  <div class="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-8">
    <Button variant="ghost" size="sm" class="-ml-2 mb-3" @click="goBack">
      <ArrowLeft class="size-4" aria-hidden="true" />{{ t('common.back') }}
    </Button>
    <div class="rounded-2xl border border-border bg-surface shadow-xs">
      <TaskDetailView :task-id="id" />
    </div>
  </div>
</template>
