import { defineStore } from 'pinia'
import { ref } from 'vue'

/** Global UI state: drawers, palettes and quick-add, shared by shell and pages. */
export const useUiStore = defineStore('ui', () => {
  const sidebarCollapsed = ref(readBool('tp.sidebar', false))
  const quickAddOpen = ref(false)
  const quickAddPreset = ref<{ kind?: 'task' | 'deadline'; projectId?: string | null; goalId?: string | null; parentId?: string | null; scheduledDate?: string | null; dueDate?: string | null } | null>(null)
  const searchOpen = ref(false)
  const taskDrawerId = ref<string | null>(null)
  const notificationsOpen = ref(false)
  const moreSheetOpen = ref(false)

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
    try {
      localStorage.setItem('tp.sidebar', sidebarCollapsed.value ? '1' : '0')
    } catch {
      /* ignore */
    }
  }
  function openQuickAdd(preset: typeof quickAddPreset.value = null) {
    quickAddPreset.value = preset
    quickAddOpen.value = true
  }
  function openTask(id: string) {
    taskDrawerId.value = id
  }
  function closeTask() {
    taskDrawerId.value = null
  }

  return { sidebarCollapsed, quickAddOpen, quickAddPreset, searchOpen, taskDrawerId, notificationsOpen, moreSheetOpen, toggleSidebar, openQuickAdd, openTask, closeTask }
})

function readBool(key: string, d: boolean) {
  try {
    const v = localStorage.getItem(key)
    return v == null ? d : v === '1'
  } catch {
    return d
  }
}
