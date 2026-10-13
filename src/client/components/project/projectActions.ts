import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { useI18n } from 'vue-i18n'
import { api } from '@/lib/api'
import { useErrorMessage } from '@/composables/useTasks'
import { useToast } from '@/composables/useToast'
import { confirm } from '@/composables/useConfirm'
import type { Project } from '@/lib/types'

/**
 * Project colors are user data stored in the database (the schema requires hex),
 * so they are literal hex values rather than design tokens.
 */
export const PROJECT_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#64748b'] as const
export const PROJECT_COLOR_KEYS = ['indigo', 'sky', 'emerald', 'amber', 'red', 'pink', 'violet', 'slate'] as const

/** Shared project mutations: archive/restore, delete (tasks are kept and moved out of the project). */
export function useProjectActions() {
  const qc = useQueryClient()
  const { t } = useI18n()
  const toast = useToast()
  const errMsg = useErrorMessage()

  function invalidate() {
    for (const key of ['projects', 'tasks', 'task', 'goals', 'goal', 'dashboard']) qc.invalidateQueries({ queryKey: [key] })
  }

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Project['status'] }) => api.patch<Project>(`/projects/${id}`, { status }),
    onSuccess: (_p, vars) => {
      invalidate()
      toast.success(vars.status === 'archived' ? t('projects.archived') : t('projects.restored'))
    },
    onError: (e) => toast.error(errMsg(e)),
  })

  async function remove(project: Pick<Project, 'id' | 'name'>) {
    const ok = await confirm({
      title: t('projects.delete.title', { name: project.name }),
      message: t('projects.delete.message'),
      danger: true,
      confirmLabel: t('common.delete'),
    })
    if (!ok) return false
    try {
      await api.del(`/projects/${project.id}`)
      invalidate()
      toast.success(t('projects.deleted'))
      return true
    } catch (e) {
      toast.error(errMsg(e))
      return false
    }
  }

  return { invalidate, setStatus, remove }
}
