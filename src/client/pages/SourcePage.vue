<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { AlertTriangle, ArrowLeft, Copy, ExternalLink, FileText, Trash2 } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { api } from '@/lib/api'
import { confirm as askConfirm } from '@/composables/useConfirm'
import { useErrorMessage } from '@/composables/useTasks'
import { useFormat } from '@/composables/useFormat'
import { useToast } from '@/composables/useToast'
import { isHttpUrl } from '@/components/capture/reviewModel'

/** A stored source: the original text plus the records created from it. */
interface LinkedItem {
  id: string
  title: string | null
  kind?: 'task' | 'goal'
  goalId?: string | null
}
interface SourceDetail {
  id: string
  title: string | null
  url: string | null
  sourceDate: string | null
  createdAt: number
  contentChars: number
  contentDeletedAt: number | null
  content: string | null
  linked?: LinkedItem[] | { tasks?: LinkedItem[]; goals?: LinkedItem[] }
}

const props = defineProps<{ id: string }>()
const { t } = useI18n()
const router = useRouter()
const qc = useQueryClient()
const f = useFormat()
const toast = useToast()
const errMsg = useErrorMessage()

const sourceQ = useQuery({
  queryKey: computed(() => ['source', props.id]),
  queryFn: ({ signal }) => api.get<SourceDetail>(`/sources/${props.id}`, undefined, signal),
  retry: false,
})

const source = computed(() => sourceQ.data.value ?? null)
const hasText = computed(() => !!source.value?.content && !source.value.contentDeletedAt)
const linked = computed<{ key: string; to: string; label: string }[]>(() => {
  const s = source.value
  if (!s?.linked) return []
  const items: { item: LinkedItem; goal: boolean }[] = Array.isArray(s.linked)
    ? s.linked.map((item) => ({ item, goal: item.kind === 'goal' }))
    : [...(s.linked.tasks ?? []).map((item) => ({ item, goal: false })), ...(s.linked.goals ?? []).map((item) => ({ item, goal: true }))]
  return items.map(({ item, goal }) => ({
    key: `${goal ? 'g' : 't'}${item.id}`,
    to: goal ? `/goals/${item.id}` : `/tasks/${item.id}`,
    label: item.title || t('source.untitled'),
  }))
})
const safeUrl = computed(() => {
  const u = source.value?.url
  return u && isHttpUrl(u) ? u : null
})

function goBack() {
  if (window.history.state?.back) router.back()
  else void router.push('/')
}

async function copyText() {
  const text = source.value?.content
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    toast.success(t('source.copied'))
  } catch (e) {
    toast.error(errMsg(e))
  }
}

async function deleteContent() {
  const ok = await askConfirm({
    title: t('source.deleteContentTitle'),
    message: t('source.deleteContentMessage'),
    confirmLabel: t('source.deleteContent'),
    danger: true,
  })
  if (!ok) return
  try {
    await api.del(`/sources/${props.id}/content`)
    await qc.invalidateQueries({ queryKey: ['source', props.id] })
    toast.success(t('source.deleteContentDone'))
  } catch (e) {
    toast.error(errMsg(e))
  }
}

async function deleteSource() {
  const ok = await askConfirm({
    title: t('source.deleteSourceTitle'),
    message: t('source.deleteSourceMessage'),
    confirmLabel: t('source.deleteSource'),
    danger: true,
  })
  if (!ok) return
  try {
    await api.del(`/sources/${props.id}`)
    qc.removeQueries({ queryKey: ['source', props.id] })
    toast.success(t('source.deleteSourceDone'))
    goBack()
  } catch (e) {
    toast.error(errMsg(e))
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-8">
    <button type="button" class="mb-4 inline-flex items-center gap-1.5 rounded-md text-[13px] font-medium text-muted hover:text-fg" @click="goBack">
      <ArrowLeft class="size-4" aria-hidden="true" />{{ t('source.back') }}
    </button>

    <div v-if="sourceQ.isPending.value" class="flex flex-col gap-4" aria-busy="true">
      <Skeleton :rows="2" />
      <Skeleton :rows="10" />
    </div>

    <EmptyState v-else-if="sourceQ.isError.value || !source" :icon="AlertTriangle" :title="t('source.notFound')">
      <Button variant="secondary" @click="router.push('/')">{{ t('nav.overview') }}</Button>
    </EmptyState>

    <template v-else>
      <header class="flex flex-col gap-2">
        <div class="flex items-center gap-2 text-subtle">
          <FileText class="size-4" aria-hidden="true" />
          <span class="text-xs font-medium uppercase tracking-wide">{{ t('source.title') }}</span>
        </div>
        <h1 class="break-words text-2xl font-semibold tracking-tight text-fg md:text-[28px]">{{ source.title || t('source.untitled') }}</h1>
        <dl class="mt-1 flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
          <div v-if="source.sourceDate" class="flex gap-1.5">
            <dt class="text-muted">{{ t('source.sourceDate') }}</dt>
            <dd class="tabular text-fg">{{ f.date(source.sourceDate) }}</dd>
          </div>
          <div class="flex gap-1.5">
            <dt class="text-muted">{{ t('source.created') }}</dt>
            <dd class="tabular text-fg">{{ f.dateTime(source.createdAt) }}</dd>
          </div>
          <div v-if="safeUrl" class="flex min-w-0 gap-1.5">
            <dt class="sr-only">{{ t('source.originalLink') }}</dt>
            <dd class="min-w-0">
              <a :href="safeUrl" target="_blank" rel="noopener noreferrer" class="inline-flex max-w-full items-center gap-1 text-primary-text underline-offset-2 hover:underline">
                <ExternalLink class="size-3.5 shrink-0" aria-hidden="true" />
                <span class="truncate">{{ t('source.originalLink') }}</span>
              </a>
            </dd>
          </div>
        </dl>
      </header>

      <Card :title="t('source.linked')" class="mt-6">
        <ul v-if="linked.length" class="flex flex-col gap-1">
          <li v-for="l in linked" :key="l.key">
            <router-link :to="l.to" class="block truncate rounded-md px-2 py-1.5 text-[13px] text-fg transition-colors hover:bg-surface-hover">{{ l.label }}</router-link>
          </li>
        </ul>
        <p v-else class="text-sm text-subtle">{{ t('source.linkedEmpty') }}</p>
      </Card>

      <Card class="mt-6" :title="t('source.content')">
        <template #actions>
          <span v-if="hasText" class="tabular text-[11px] text-subtle">{{ t('source.chars', { n: f.number(source.contentChars, 0) }) }}</span>
        </template>
        <pre
          v-if="hasText"
          class="max-h-[70vh] overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-surface-sunken p-4 font-sans text-[13px] leading-relaxed text-fg"
          tabindex="0"
        >{{ source.content }}</pre>
        <EmptyState v-else compact :icon="FileText" :title="t('source.deleted')" :description="t('source.deletedHint')" />
      </Card>

      <div class="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
        <div class="flex flex-wrap gap-2">
          <Button v-if="hasText" variant="secondary" size="sm" @click="copyText"><Copy aria-hidden="true" />{{ t('source.copy') }}</Button>
          <Button v-if="hasText" variant="ghost" size="sm" @click="deleteContent"><Trash2 aria-hidden="true" />{{ t('source.deleteContent') }}</Button>
        </div>
        <Button variant="danger-ghost" size="sm" @click="deleteSource"><Trash2 aria-hidden="true" />{{ t('source.deleteSource') }}</Button>
      </div>
    </template>
  </div>
</template>
