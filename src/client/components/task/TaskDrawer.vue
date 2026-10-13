<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import Drawer from '@/components/ui/Drawer.vue'
import TaskDetailView from './TaskDetailView.vue'
import { useTaskDetail } from '@/composables/useTasks'
import { useUiStore } from '@/stores/ui'

/** Right-side task drawer, opened through ui.openTask(id). Closes on navigation. */
const { t } = useI18n()
const ui = useUiStore()
const route = useRoute()
const taskId = computed(() => ui.taskDrawerId)
const { data } = useTaskDetail(taskId)
const title = computed(() => data.value?.title || t('taskDetail.untitled'))

watch(
  () => route.fullPath,
  () => ui.closeTask(),
)

function onOpenChange(open: boolean) {
  if (!open) ui.closeTask()
}
</script>

<template>
  <Drawer :open="true" :title="title" width="560px" @update:open="onOpenChange">
    <TaskDetailView v-if="ui.taskDrawerId" :task-id="ui.taskDrawerId" in-drawer class="flex min-h-0 flex-1 flex-col" @close="ui.closeTask()" />
  </Drawer>
</template>
