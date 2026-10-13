// TanStack Query keys, queries and mutations for planning entities.
// Optimistic updates are used only for safe toggles and always roll back on error.

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/vue-query'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useI18n } from 'vue-i18n'
import { api, ApiError } from '@/lib/api'
import type { Checkpoint, Dashboard, Goal, GoalDetail, Paged, Project, Tag, Task, TaskDetail } from '@/lib/types'
import type { TaskCreateInput, TaskUpdateInput } from '@shared/schemas'
import { useToast } from './useToast'

export const qk = {
  dashboard: ['dashboard'] as const,
  tasks: (params: Record<string, unknown>) => ['tasks', params] as const,
  task: (id: string) => ['task', id] as const,
  goals: (params: Record<string, unknown> = {}) => ['goals', params] as const,
  goal: (id: string) => ['goal', id] as const,
  projects: ['projects'] as const,
  tags: ['tags'] as const,
  calendar: (from: string, to: string) => ['calendar', from, to] as const,
  analytics: (range: number) => ['analytics', range] as const,
  notifications: ['notifications'] as const,
}

/** Everything that may show a task; invalidated after any task mutation. */
export function invalidatePlanning(qc: QueryClient) {
  for (const key of ['tasks', 'task', 'dashboard', 'calendar', 'goals', 'goal', 'analytics']) qc.invalidateQueries({ queryKey: [key] })
}

export function useTaskList(params: MaybeRefOrGetter<Record<string, string | number | undefined>>) {
  return useQuery({
    queryKey: computed(() => qk.tasks(toValue(params))),
    queryFn: ({ signal }) => api.get<Paged<Task>>('/tasks', toValue(params), signal),
  })
}

export function useTaskDetail(id: MaybeRefOrGetter<string | null>) {
  return useQuery({
    queryKey: computed(() => qk.task(toValue(id) ?? '')),
    queryFn: ({ signal }) => api.get<TaskDetail>(`/tasks/${toValue(id)}`, undefined, signal),
    enabled: computed(() => !!toValue(id)),
  })
}

export function useDashboard() {
  return useQuery({ queryKey: qk.dashboard, queryFn: ({ signal }) => api.get<Dashboard>('/dashboard', undefined, signal), refetchInterval: 60_000 })
}

export function useGoals(params: MaybeRefOrGetter<Record<string, string | undefined>> = {}) {
  return useQuery({ queryKey: computed(() => qk.goals(toValue(params))), queryFn: ({ signal }) => api.get<Goal[]>('/goals', toValue(params), signal) })
}

export function useGoalDetail(id: MaybeRefOrGetter<string>) {
  return useQuery({ queryKey: computed(() => qk.goal(toValue(id))), queryFn: ({ signal }) => api.get<GoalDetail>(`/goals/${toValue(id)}`, undefined, signal) })
}

export function useProjects() {
  return useQuery({ queryKey: qk.projects, queryFn: ({ signal }) => api.get<Project[]>('/projects', undefined, signal), staleTime: 60_000 })
}

export function useTags() {
  return useQuery({ queryKey: qk.tags, queryFn: ({ signal }) => api.get<Tag[]>('/tags', undefined, signal), staleTime: 60_000 })
}

/** Human-readable message for an API error code (falls back to the server message). */
export function useErrorMessage() {
  const { t, te } = useI18n()
  return (e: unknown) => {
    if (e instanceof ApiError) {
      const key = `errors.${e.code}`
      return te(key) ? t(key) : e.message
    }
    return t('errors.INTERNAL_ERROR')
  }
}

export function useTaskActions() {
  const qc = useQueryClient()
  const toast = useToast()
  const { t } = useI18n()
  const errMsg = useErrorMessage()

  /** Patch a task in every cached list/detail (optimistic), returning a rollback. */
  function patchCaches(id: string, patch: Partial<Task>) {
    const snapshots = qc.getQueriesData<unknown>({ predicate: (q) => ['tasks', 'task', 'dashboard'].includes(String(q.queryKey[0])) })
    const apply = (t: Task): Task => (t.id === id ? { ...t, ...patch } : t)
    qc.setQueriesData<unknown>({ queryKey: ['tasks'] }, (old: unknown) => {
      const o = old as Paged<Task> | undefined
      return o ? { ...o, items: o.items.map(apply) } : old
    })
    qc.setQueriesData<unknown>({ queryKey: ['task', id] }, (old: unknown) => (old ? { ...(old as TaskDetail), ...patch } : old))
    qc.setQueriesData<unknown>({ queryKey: ['dashboard'] }, (old: unknown) => {
      const d = old as Dashboard | undefined
      return d ? { ...d, todayTasks: d.todayTasks.map(apply), upcoming: d.upcoming.map(apply), attention: d.attention.map(apply) } : old
    })
    return () => snapshots.forEach(([key, data]) => qc.setQueryData(key, data))
  }

  const toggleComplete = useMutation({
    mutationFn: (task: Task) => api.post<Task>(`/tasks/${task.id}/${task.status === 'completed' ? 'reopen' : 'complete'}`),
    onMutate: (task) => {
      const completing = task.status !== 'completed'
      return { rollback: patchCaches(task.id, { status: completing ? 'completed' : 'in_progress', completedAt: completing ? Date.now() : null }), completing }
    },
    onError: (e, _task, ctx) => {
      ctx?.rollback()
      toast.error(errMsg(e))
    },
    onSuccess: (_d, task, ctx) => {
      if (ctx?.completing) toast.undoable(t('toast.completed', { title: task.title }), t('common.undo'), () => reopen(task.id))
    },
    onSettled: () => setTimeout(() => invalidatePlanning(qc), 450),
  })

  async function reopen(id: string) {
    await api.post(`/tasks/${id}/reopen`)
    invalidatePlanning(qc)
  }

  async function create(input: Partial<TaskCreateInput> & { title: string }) {
    const r = await api.post<TaskDetail>('/tasks', input)
    invalidatePlanning(qc)
    return r
  }

  async function update(id: string, patch: TaskUpdateInput) {
    const r = await api.patch<{ task: TaskDetail; previous: Task }>(`/tasks/${id}`, patch)
    qc.setQueryData(qk.task(id), r.task)
    invalidatePlanning(qc)
    return r
  }

  async function transition(id: string, action: 'pause' | 'resume' | 'archive' | 'unarchive' | 'complete' | 'reopen') {
    await api.post(`/tasks/${id}/${action}`)
    invalidatePlanning(qc)
  }

  async function remove(task: Pick<Task, 'id' | 'title'>) {
    await api.del(`/tasks/${task.id}`)
    invalidatePlanning(qc)
    toast.undoable(t('toast.deleted', { title: task.title }), t('common.undo'), async () => {
      await api.post(`/tasks/${task.id}/restore`)
      invalidatePlanning(qc)
      toast.success(t('toast.restored'))
    })
  }

  async function duplicate(id: string) {
    const r = await api.post<{ id: string }>(`/tasks/${id}/duplicate`)
    invalidatePlanning(qc)
    toast.success(t('toast.duplicated'))
    return r.id
  }

  return { toggleComplete, create, update, transition, remove, duplicate, reopen, patchCaches }
}

export function useCheckpointActions() {
  const qc = useQueryClient()
  const toast = useToast()
  const { t } = useI18n()
  const errMsg = useErrorMessage()

  async function toggle(cp: Checkpoint) {
    const next = cp.status === 'done' ? 'pending' : 'done'
    try {
      const r = await api.patch<{ affected: { id: string; title: string }[] }>(`/checkpoints/${cp.id}`, { status: next })
      invalidatePlanning(qc)
      return r
    } catch (e) {
      toast.error(errMsg(e))
      throw e
    }
  }

  async function update(id: string, patch: Record<string, unknown>) {
    const r = await api.patch<{ affected: { id: string; title: string; targetDate: string | null }[] }>(`/checkpoints/${id}`, patch)
    invalidatePlanning(qc)
    if (r.affected.length) toast.info(t('checkpoints.affected', { n: r.affected.length }))
    return r
  }

  async function create(input: Record<string, unknown>) {
    const r = await api.post<{ id: string }>('/checkpoints', input)
    invalidatePlanning(qc)
    return r
  }

  async function remove(cp: Pick<Checkpoint, 'id' | 'title'>) {
    await api.del(`/checkpoints/${cp.id}`)
    invalidatePlanning(qc)
    toast.undoable(t('toast.deleted', { title: cp.title }), t('common.undo'), async () => {
      await api.post(`/checkpoints/${cp.id}/restore`)
      invalidatePlanning(qc)
    })
  }

  async function reorder(orderedIds: string[]) {
    await api.post('/checkpoints/reorder', { orderedIds })
    invalidatePlanning(qc)
  }

  return { toggle, update, create, remove, reorder }
}
