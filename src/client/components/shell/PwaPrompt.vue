<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { CheckCircle2, Download, RefreshCw, X } from 'lucide-vue-next'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'tp.installDismissed'
const { t } = useI18n()
const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW({ immediate: true })

const installEvent = ref<BeforeInstallPromptEvent | null>(null)
const installDismissed = ref(readDismissed())
const offlineNotice = ref(false)
let offlineTimer: ReturnType<typeof setTimeout> | undefined

function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

function rememberDismissed() {
  installDismissed.value = true
  try {
    localStorage.setItem(DISMISS_KEY, '1')
  } catch {
    /* storage unavailable: the offer simply shows again */
  }
}

function onBeforeInstall(e: Event) {
  e.preventDefault()
  if (!installDismissed.value) installEvent.value = e as BeforeInstallPromptEvent
}
function onInstalled() {
  installEvent.value = null
  rememberDismissed()
}

async function install() {
  const ev = installEvent.value
  if (!ev) return
  installEvent.value = null
  await ev.prompt()
  await ev.userChoice.catch(() => undefined)
  rememberDismissed()
}

function later() {
  needRefresh.value = false
}

watch(offlineReady, (ready) => {
  if (!ready) return
  offlineNotice.value = true
  offlineTimer = setTimeout(() => (offlineNotice.value = false), 4000)
})

onMounted(() => {
  window.addEventListener('beforeinstallprompt', onBeforeInstall)
  window.addEventListener('appinstalled', onInstalled)
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  window.removeEventListener('appinstalled', onInstalled)
  clearTimeout(offlineTimer)
})
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-start gap-2 px-4 md:bottom-6 md:px-6">
    <Transition name="pop">
      <div v-if="needRefresh || (installEvent && !installDismissed)" class="pointer-events-auto w-full max-w-sm rounded-2xl border border-border bg-surface-raised p-4 shadow-lg" role="status" aria-live="polite">
        <template v-if="needRefresh">
          <div class="flex items-start gap-3">
            <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-text"><RefreshCw class="size-4" aria-hidden="true" /></span>
            <div class="min-w-0 flex-1">
              <p class="text-[13px] font-semibold text-fg">{{ t('pwa.newVersion') }}</p>
              <p class="mt-0.5 text-xs text-muted">{{ t('pwa.newVersionHint') }}</p>
            </div>
          </div>
          <div class="mt-3 flex justify-end gap-2">
            <button type="button" class="h-8 rounded-md px-3 text-[13px] font-medium text-muted transition hover:bg-surface-hover hover:text-fg" @click="later">{{ t('pwa.later') }}</button>
            <button type="button" class="h-8 rounded-md bg-primary px-3 text-[13px] font-medium text-on-primary shadow-sm transition hover:bg-primary-hover" @click="updateServiceWorker(true)">{{ t('pwa.reload') }}</button>
          </div>
        </template>
        <template v-else>
          <div class="flex items-start gap-3">
            <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-text"><Download class="size-4" aria-hidden="true" /></span>
            <div class="min-w-0 flex-1">
              <p class="text-[13px] font-semibold text-fg">{{ t('pwa.installTitle') }}</p>
              <p class="mt-0.5 text-xs text-muted">{{ t('pwa.installHint') }}</p>
            </div>
            <button type="button" class="-mr-1 -mt-1 grid size-7 place-items-center rounded-md text-subtle transition hover:bg-surface-hover hover:text-fg" :aria-label="t('pwa.dismiss')" @click="rememberDismissed">
              <X class="size-4" aria-hidden="true" />
            </button>
          </div>
          <div class="mt-3 flex justify-end gap-2">
            <button type="button" class="h-8 rounded-md px-3 text-[13px] font-medium text-muted transition hover:bg-surface-hover hover:text-fg" @click="rememberDismissed">{{ t('pwa.notNow') }}</button>
            <button type="button" class="h-8 rounded-md bg-primary px-3 text-[13px] font-medium text-on-primary shadow-sm transition hover:bg-primary-hover" @click="install">{{ t('pwa.install') }}</button>
          </div>
        </template>
      </div>
    </Transition>
    <Transition name="fade">
      <div v-if="offlineNotice" class="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-border bg-surface-raised px-3.5 py-2 text-xs font-medium text-fg shadow-md" role="status">
        <CheckCircle2 class="size-3.5 text-success" aria-hidden="true" />
        {{ t('pwa.offlineReady') }}
      </div>
    </Transition>
  </div>
</template>
