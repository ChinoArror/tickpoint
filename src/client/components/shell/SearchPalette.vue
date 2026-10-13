<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useQuery } from '@tanstack/vue-query'
import { refDebounced } from '@vueuse/core'
import { CornerDownLeft, FolderKanban, ListChecks, Plus, Search, Sparkles, Target } from 'lucide-vue-next'
import Dialog from '@/components/ui/Dialog.vue'
import Kbd from '@/components/ui/Kbd.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { NAV } from '@/layouts/nav'
import { useUiStore } from '@/stores/ui'
import { api } from '@/lib/api'

interface SearchHit {
  id: string
  title?: string | null
  name?: string | null
  subtitle?: string | null
}
interface SearchResults {
  tasks?: SearchHit[]
  goals?: SearchHit[]
  projects?: SearchHit[]
}
type Group = 'jump' | 'actions' | 'tasks' | 'goals' | 'projects'
interface Entry {
  key: string
  group: Group
  label: string
  hint?: string | null
  icon: Component
  index: number
  run: () => void
}

const { t } = useI18n()
const router = useRouter()
const ui = useUiStore()

const open = computed({
  get: () => ui.searchOpen,
  set: (v: boolean) => {
    ui.searchOpen = v
  },
})
const query = ref('')
const term = refDebounced(computed(() => query.value.trim()), 200)
const active = ref(0)
const inputEl = ref<HTMLInputElement | null>(null)

const results = useQuery({
  queryKey: computed(() => ['search', term.value]),
  queryFn: ({ signal }) => api.get<SearchResults>('/search', { q: term.value }, signal),
  enabled: computed(() => term.value.length > 0),
  staleTime: 30_000,
})

const needle = computed(() => term.value.toLowerCase())
const matches = (text: string) => !needle.value || text.toLowerCase().includes(needle.value)

function go(to: string) {
  ui.searchOpen = false
  void router.push(to)
}

const groups = computed(() => {
  let index = 0
  const out: { group: Group; heading: string; entries: Entry[] }[] = []
  const push = (group: Group, entries: Omit<Entry, 'index' | 'group'>[]) => {
    if (!entries.length) return
    out.push({
      group,
      heading: t(`searchPalette.groups.${group}`),
      entries: entries.map((e) => ({ ...e, group, index: index++ })),
    })
  }

  const actions: Omit<Entry, 'index' | 'group'>[] = []
  if (matches(t('searchPalette.commands.newTask'))) actions.push({ key: 'new-task', label: t('searchPalette.commands.newTask'), icon: Plus, run: () => { ui.searchOpen = false; ui.openQuickAdd() } })
  if (matches(t('searchPalette.commands.capture'))) actions.push({ key: 'capture', label: t('searchPalette.commands.capture'), icon: Sparkles, run: () => go('/capture') })
  push('actions', actions)

  push(
    'jump',
    NAV.filter((n) => n.key !== 'capture' && matches(t(`nav.${n.key}`))).map((n) => ({
      key: `nav-${n.key}`,
      label: t(`nav.${n.key}`),
      icon: n.icon,
      run: () => go(n.to),
    })),
  )

  if (term.value) {
    const data = results.data.value
    push(
      'tasks',
      (data?.tasks ?? []).map((h) => ({ key: `task-${h.id}`, label: h.title ?? t('common.untitled'), hint: h.subtitle, icon: ListChecks, run: () => { ui.searchOpen = false; ui.openTask(h.id) } })),
    )
    push(
      'goals',
      (data?.goals ?? []).map((h) => ({ key: `goal-${h.id}`, label: h.title ?? t('common.untitled'), hint: h.subtitle, icon: Target, run: () => go(`/goals/${h.id}`) })),
    )
    push(
      'projects',
      (data?.projects ?? []).map((h) => ({ key: `project-${h.id}`, label: h.name ?? h.title ?? t('common.untitled'), hint: h.subtitle, icon: FolderKanban, run: () => go(`/projects/${h.id}`) })),
    )
  }
  return out
})

const flat = computed(() => groups.value.flatMap((g) => g.entries))
const hasHits = computed(() => groups.value.some((g) => g.group === 'tasks' || g.group === 'goals' || g.group === 'projects'))
watch(term, () => (active.value = 0))

function activate(e: Entry) {
  e.run()
}

function onKey(e: KeyboardEvent) {
  if (e.isComposing) return
  const n = flat.value.length
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (n) active.value = (active.value + 1) % n
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (n) active.value = (active.value - 1 + n) % n
  } else if (e.key === 'Enter') {
    const target = flat.value[active.value]
    if (target) {
      e.preventDefault()
      activate(target)
    }
  }
}

/** Split text around the first case-insensitive match so it can be highlighted. */
function segments(text: string) {
  const q = term.value
  const idx = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1
  if (idx < 0) return [{ text, hit: false }]
  return [
    { text: text.slice(0, idx), hit: false },
    { text: text.slice(idx, idx + q.length), hit: true },
    { text: text.slice(idx + q.length), hit: false },
  ]
}

const activeId = computed(() => (flat.value[active.value] ? `sp-${flat.value[active.value].key}` : undefined))

onMounted(() => nextTick(() => requestAnimationFrame(() => inputEl.value?.focus())))
</script>

<template>
  <Dialog v-model:open="open" :title="t('searchPalette.title')" size="lg" hide-title>
    <div class="-mx-5 -mt-1">
      <div class="flex h-13 items-center gap-2.5 border-b border-border px-4">
        <Search class="size-4 shrink-0 text-subtle" aria-hidden="true" />
        <label for="search-palette-input" class="sr-only">{{ t('search.placeholder') }}</label>
        <input
          id="search-palette-input"
          ref="inputEl"
          v-model="query"
          autofocus
          type="text"
          autocomplete="off"
          role="combobox"
          aria-expanded="true"
          aria-controls="search-palette-list"
          aria-autocomplete="list"
          :aria-activedescendant="activeId"
          class="h-12 min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-subtle"
          :placeholder="t('search.placeholder')"
          @keydown="onKey"
        />
      </div>

      <div class="max-h-[min(60dvh,520px)] min-h-[160px] overflow-y-auto p-2">
        <div v-if="term && results.isPending.value" class="flex flex-col gap-2 p-2" aria-live="polite">
          <Skeleton :rows="3" height="36px" />
        </div>
        <p v-if="term && !results.isPending.value && !hasHits" class="px-3 py-6 text-center text-[13px] text-muted" aria-live="polite">
          {{ t('searchPalette.noResults', { q: term }) }}
        </p>

        <ul id="search-palette-list" role="listbox" :aria-label="t('searchPalette.title')" class="flex flex-col">
          <li v-for="g in groups" :key="g.group" role="presentation">
            <p role="presentation" class="px-2.5 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-subtle">{{ g.heading }}</p>
            <ul role="presentation" class="flex flex-col">
              <li
                v-for="e in g.entries"
                :id="`sp-${e.key}`"
                :key="e.key"
                role="option"
                :aria-selected="e.index === active"
                class="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] transition-colors"
                :class="e.index === active ? 'bg-surface-hover text-fg' : 'text-muted'"
                @mouseenter="active = e.index"
                @click="activate(e)"
              >
                <span class="grid size-7 shrink-0 place-items-center rounded-md bg-surface-sunken text-muted" aria-hidden="true"><component :is="e.icon" class="size-4" /></span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-medium text-fg">
                    <template v-for="(s, i) in segments(e.label)" :key="i"><mark v-if="s.hit" class="rounded-sm bg-primary-soft text-primary-text">{{ s.text }}</mark><template v-else>{{ s.text }}</template></template>
                  </span>
                  <span v-if="e.hint" class="block truncate text-xs text-subtle">{{ e.hint }}</span>
                </span>
                <CornerDownLeft v-if="e.index === active" class="size-3.5 shrink-0 text-subtle" aria-hidden="true" />
              </li>
            </ul>
          </li>
        </ul>
      </div>

      <footer class="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-2.5 text-[11px] text-subtle">
        <span class="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd>{{ t('searchPalette.hints.navigate') }}</span>
        <span class="flex items-center gap-1"><Kbd><CornerDownLeft class="size-3" aria-hidden="true" /></Kbd>{{ t('searchPalette.hints.open') }}</span>
        <span class="flex items-center gap-1"><Kbd>Esc</Kbd>{{ t('searchPalette.hints.close') }}</span>
      </footer>
    </div>
  </Dialog>
</template>
