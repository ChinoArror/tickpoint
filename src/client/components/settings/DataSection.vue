<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { AlertTriangle, Archive, Download, FileJson, RotateCcw, Trash2, Upload } from 'lucide-vue-next'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Switch from '@/components/ui/Switch.vue'
import { api, downloadUrl } from '@/lib/api'
import { confirm } from '@/composables/useConfirm'
import { useFormat } from '@/composables/useFormat'
import { useToast } from '@/composables/useToast'
import { useErrorMessage, invalidatePlanning } from '@/composables/useTasks'
import { LIMITS } from '@shared/constants'

interface BackupRow {
  id: string
  createdAt: number
  size?: number | null
  sizeBytes?: number | null
}
type Summary = Record<string, unknown>

const { t, te } = useI18n()
const router = useRouter()
const qc = useQueryClient()
const f = useFormat()
const toast = useToast()
const errMsg = useErrorMessage()

// ---- Export ---------------------------------------------------------------
const exportLinks = [
  { key: 'json', run: () => downloadUrl('/export/json') },
  { key: 'jsonNoSources', run: () => downloadUrl('/export/json', { sources: 0 }) },
  { key: 'tasksCsv', run: () => downloadUrl('/export/csv', { type: 'tasks' }) },
  { key: 'progressCsv', run: () => downloadUrl('/export/csv', { type: 'progress' }) },
] as const

// ---- Import ---------------------------------------------------------------
const fileInput = ref<HTMLInputElement | null>(null)
const fileName = ref<string | null>(null)
const parsed = ref<unknown>(null)
const importError = ref<string | null>(null)
const preview = ref<Summary | null>(null)
const previewing = ref(false)
const skipDuplicates = ref(true)
const result = ref<Summary | null>(null)

function label(key: string) {
  const k = `dataTools.entities.${key}`
  return te(k) ? t(k) : key
}

/** Numeric counts from a preview or result, whether or not they are nested under `counts`. */
function countRows(obj: Summary | null) {
  const src = (obj?.counts && typeof obj.counts === 'object' ? obj.counts : obj) as Record<string, unknown> | null
  return Object.entries(src ?? {})
    .filter(([, v]) => typeof v === 'number')
    .map(([k, v]) => ({ key: k, label: label(k), value: f.number(v as number, 0) }))
}

const sampleTitles = computed<string[]>(() => {
  const p = preview.value
  const list = (p?.sampleTasks ?? p?.samples ?? p?.sample) as { title?: string }[] | undefined
  return Array.isArray(list) ? list.map((x) => x.title ?? '').filter(Boolean).slice(0, 8) : []
})

function resetImport() {
  fileName.value = null
  parsed.value = null
  preview.value = null
  result.value = null
  importError.value = null
  if (fileInput.value) fileInput.value.value = ''
}

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  resetImport()
  if (!file) return
  fileName.value = file.name
  if (file.size > LIMITS.importMaxBytes) {
    importError.value = t('dataTools.importTooLarge', { max: '5 MB' })
    return
  }
  try {
    parsed.value = JSON.parse(await file.text())
  } catch {
    importError.value = t('dataTools.invalidJson')
    return
  }
  previewing.value = true
  try {
    preview.value = await api.post<Summary>('/import', parsed.value, { mode: 'preview' })
  } catch (err) {
    importError.value = errMsg(err)
  } finally {
    previewing.value = false
  }
}

const commit = useMutation({
  mutationFn: () => api.post<Summary>('/import', parsed.value, { mode: 'commit', skipDuplicates: skipDuplicates.value ? 1 : 0 }),
  onSuccess: (r) => {
    result.value = r
    preview.value = null
    toast.success(t('dataTools.imported'))
    invalidatePlanning(qc)
    void qc.invalidateQueries({ queryKey: ['backups'] })
  },
  onError: (e) => {
    importError.value = errMsg(e)
  },
})

// ---- Backups ---------------------------------------------------------------
const backups = useQuery({
  queryKey: ['backups'],
  queryFn: async () => {
    const raw = await api.get<BackupRow[] | { items: BackupRow[] }>('/backups')
    return Array.isArray(raw) ? raw : (raw.items ?? [])
  },
})

function sizeLabel(b: BackupRow) {
  const bytes = b.size ?? b.sizeBytes ?? null
  if (bytes == null) return '—'
  if (bytes < 1024 * 1024) return t('dataTools.sizeKb', { n: f.number(bytes / 1024, 1) })
  return t('dataTools.sizeMb', { n: f.number(bytes / (1024 * 1024), 1) })
}

const createBackup = useMutation({
  mutationFn: () => api.post<BackupRow>('/backups'),
  onSuccess: () => {
    toast.success(t('dataTools.backups.created'))
    void qc.invalidateQueries({ queryKey: ['backups'] })
  },
  onError: (e) => toast.error(errMsg(e)),
})

const restoreBackup = useMutation({
  mutationFn: (id: string) => api.post<Summary>(`/backups/${id}/restore`),
  onSuccess: () => {
    toast.success(t('dataTools.backups.restored'))
    invalidatePlanning(qc)
    void qc.invalidateQueries({ queryKey: ['backups'] })
  },
  onError: (e) => toast.error(errMsg(e)),
})

const deleteBackup = useMutation({
  mutationFn: (id: string) => api.del(`/backups/${id}`),
  onSuccess: () => {
    toast.success(t('dataTools.backups.deleted'))
    void qc.invalidateQueries({ queryKey: ['backups'] })
  },
  onError: (e) => toast.error(errMsg(e)),
})

async function confirmRestore(b: BackupRow) {
  const ok = await confirm({
    title: t('dataTools.backups.restoreTitle'),
    message: t('dataTools.backups.restoreMessage'),
    confirmLabel: t('dataTools.backups.restore'),
  })
  if (ok) restoreBackup.mutate(b.id)
}

async function confirmDeleteBackup(b: BackupRow) {
  const ok = await confirm({
    title: t('dataTools.backups.deleteTitle'),
    message: t('dataTools.backups.deleteMessage'),
    confirmLabel: t('common.delete'),
    danger: true,
  })
  if (ok) deleteBackup.mutate(b.id)
}

// ---- Danger zone ---------------------------------------------------------------
const wiping = useMutation({
  mutationFn: () => api.del('/account/data', { confirm: 'DELETE' }),
  onSuccess: () => {
    toast.success(t('dataTools.danger.deleted'))
    qc.clear()
    void router.replace('/')
  },
  onError: (e) => toast.error(errMsg(e)),
})

async function confirmWipe() {
  const ok = await confirm({
    title: t('dataTools.danger.title'),
    message: t('dataTools.danger.message'),
    confirmLabel: t('dataTools.danger.confirm'),
    danger: true,
    typeToConfirm: 'DELETE',
  })
  if (ok) wiping.mutate()
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- Export -->
    <Card :title="t('dataTools.export.title')" :subtitle="t('dataTools.export.subtitle')" :padded="true">
      <div class="grid gap-2 sm:grid-cols-2">
        <button
          v-for="ex in exportLinks"
          :key="ex.key"
          type="button"
          class="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left shadow-xs transition hover:border-border-strong hover:bg-surface-hover"
          @click="ex.run()"
        >
          <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-sunken text-muted"><Download class="size-4" aria-hidden="true" /></span>
          <span class="min-w-0 flex-1">
            <span class="block text-[13px] font-medium text-fg">{{ t(`dataTools.export.${ex.key}`) }}</span>
            <span class="block text-xs text-muted">{{ t(`dataTools.export.${ex.key}Hint`) }}</span>
          </span>
        </button>
      </div>
    </Card>

    <!-- Import -->
    <Card :title="t('dataTools.import.title')" :subtitle="t('dataTools.import.subtitle')" :padded="true">
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input ref="fileInput" type="file" accept=".json,application/json" class="sr-only" tabindex="-1" :aria-label="t('dataTools.import.choose')" @change="onFile" />
          <Button variant="secondary" @click="fileInput?.click()"><Upload class="size-4" aria-hidden="true" />{{ t('dataTools.import.choose') }}</Button>
          <p class="min-w-0 truncate text-xs text-muted" aria-live="polite">
            <FileJson class="mr-1 inline size-3.5 align-[-2px]" aria-hidden="true" />
            {{ fileName ?? t('dataTools.import.noFile') }}
          </p>
        </div>
        <p class="text-xs text-subtle">{{ t('dataTools.import.limit', { max: '5 MB' }) }}</p>

        <p v-if="importError" class="rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger-text" role="alert">{{ importError }}</p>
        <p v-if="previewing" class="text-xs text-muted" role="status">{{ t('dataTools.import.previewing') }}</p>

        <div v-if="preview" class="flex flex-col gap-4 rounded-xl bg-surface-sunken p-4" aria-live="polite">
          <h3 class="text-[13px] font-semibold text-fg">{{ t('dataTools.import.previewTitle') }}</h3>
          <table v-if="countRows(preview).length" class="w-full text-xs">
            <tbody>
              <tr v-for="row in countRows(preview)" :key="row.key" class="border-b border-border/60 last:border-0">
                <th scope="row" class="py-1.5 pr-3 text-left font-normal text-muted">{{ row.label }}</th>
                <td class="tabular py-1.5 text-right font-medium text-fg">{{ row.value }}</td>
              </tr>
            </tbody>
          </table>
          <div v-if="sampleTitles.length">
            <p class="mb-1.5 text-xs font-medium text-muted">{{ t('dataTools.import.samples') }}</p>
            <ul class="flex flex-col gap-1 text-xs text-fg">
              <li v-for="(title, i) in sampleTitles" :key="i" class="truncate">• {{ title }}</li>
            </ul>
          </div>
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-2.5 text-[13px] text-fg">
              <Switch v-model="skipDuplicates" :label="t('dataTools.import.skipDuplicates')" />
              <span>{{ t('dataTools.import.skipDuplicates') }}</span>
            </div>
            <Button variant="primary" :loading="commit.isPending.value" @click="commit.mutate()">{{ t('dataTools.import.run') }}</Button>
          </div>
          <p class="text-xs text-subtle">{{ t('dataTools.import.skipDuplicatesHint') }}</p>
        </div>

        <div v-if="result" class="flex flex-col gap-2 rounded-xl border border-success/30 bg-success-soft p-4 text-xs text-success-text" role="status">
          <p class="text-[13px] font-semibold">{{ t('dataTools.import.resultTitle') }}</p>
          <ul class="flex flex-wrap gap-2">
            <li v-for="row in countRows(result)" :key="row.key"><Badge size="sm">{{ row.label }}: <span class="tabular font-semibold">{{ row.value }}</span></Badge></li>
          </ul>
        </div>
      </div>
    </Card>

    <!-- Backups -->
    <Card :title="t('dataTools.backups.title')" :subtitle="t('dataTools.backups.subtitle')" :padded="true">
      <template #actions>
        <Button variant="soft" size="sm" :loading="createBackup.isPending.value" @click="createBackup.mutate()"><Archive class="size-4" aria-hidden="true" />{{ t('dataTools.backups.create') }}</Button>
      </template>
      <Skeleton v-if="backups.isPending.value" :rows="2" height="44px" />
      <p v-else-if="backups.isError.value" class="text-sm text-danger-text" role="alert">{{ t('errors.loadFailed') }}</p>
      <p v-else-if="!backups.data.value?.length" class="py-4 text-center text-xs text-subtle">{{ t('dataTools.backups.empty') }}</p>
      <ul v-else class="flex flex-col divide-y divide-border">
        <li v-for="b in backups.data.value" :key="b.id" class="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
          <div class="min-w-0 flex-1">
            <p class="tabular text-[13px] font-medium text-fg">{{ f.dateTime(b.createdAt) }}</p>
            <p class="text-xs text-muted">{{ sizeLabel(b) }}</p>
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            <Button variant="ghost" size="xs" @click="downloadUrl(`/backups/${b.id}/download`)"><Download class="size-3.5" aria-hidden="true" />{{ t('dataTools.backups.download') }}</Button>
            <Button variant="ghost" size="xs" :loading="restoreBackup.isPending.value && restoreBackup.variables.value === b.id" @click="confirmRestore(b)"><RotateCcw class="size-3.5" aria-hidden="true" />{{ t('dataTools.backups.restore') }}</Button>
            <Button variant="danger-ghost" size="xs" @click="confirmDeleteBackup(b)"><Trash2 class="size-3.5" aria-hidden="true" />{{ t('common.delete') }}</Button>
          </div>
        </li>
      </ul>
    </Card>

    <!-- Danger zone -->
    <Card class="border-danger/30" :padded="true">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex min-w-0 gap-3">
          <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-danger-soft text-danger-text" aria-hidden="true"><AlertTriangle class="size-4" /></span>
          <div class="min-w-0">
            <h2 class="text-[13px] font-semibold text-danger-text">{{ t('dataTools.danger.title') }}</h2>
            <p class="mt-0.5 max-w-md text-xs leading-relaxed text-muted">{{ t('dataTools.danger.description') }}</p>
          </div>
        </div>
        <Button variant="danger" class="shrink-0" :loading="wiping.isPending.value" @click="confirmWipe"><Trash2 class="size-4" aria-hidden="true" />{{ t('dataTools.danger.action') }}</Button>
      </div>
    </Card>
  </div>
</template>
