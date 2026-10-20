<script setup lang="ts">
// One-time, in-context request for Android notification permission. Shown in the Android
// app only, after sign-in and Terms acceptance (AppShell is authenticated-only). Once the user
// answers (Allow or Not now), or closes the sheet, it is not shown again; Settings stays the place to change it.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Bell } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import { native } from '@/platform'
import { useSessionStore } from '@/stores/session'
import { useToast } from '@/composables/useToast'
import { useErrorMessage } from '@/composables/useTasks'

const STORAGE_KEY = 'tp.pushPrompted'
/** Waits for the first authenticated screen to settle before asking. */
const SHOW_DELAY_MS = 1500

const { t } = useI18n()
const session = useSessionStore()
const toast = useToast()
const errMsg = useErrorMessage()

const open = ref(false)
const busy = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

function alreadyPrompted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function rememberPrompted(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    /* ignore: the prompt may show again on a later start */
  }
}

onMounted(() => {
  const platform = native
  if (!platform || alreadyPrompted()) return
  timer = setTimeout(async () => {
    if (alreadyPrompted()) return
    const status = await platform.push.status().catch(() => 'unavailable' as const)
    // Only ask when the permission has never been asked; never for unavailable, denied or granted.
    if (status === 'prompt' && !alreadyPrompted()) open.value = true
  }, SHOW_DELAY_MS)
})

onBeforeUnmount(() => clearTimeout(timer))

/** Any close (Escape, the close button, the overlay) counts as "Not now". */
function onOpenChange(next: boolean): void {
  if (!next) rememberPrompted()
}

function dismiss(): void {
  rememberPrompted()
  open.value = false
}

async function allow(): Promise<void> {
  if (!native || busy.value) return
  busy.value = true
  rememberPrompted()
  try {
    const result = await native.push.enable()
    if (result === 'granted') {
      // The dispatcher only sends to the device when the account's notifyPush is on.
      if (!session.settings?.notifyPush) {
        try {
          await session.updateSettings({ notifyPush: true })
        } catch (e) {
          toast.error(errMsg(e))
          return
        }
      }
      toast.success(t('nativePlatform.pushPrompt.enabled'))
    } else if (result === 'denied') {
      toast.info(t('nativePlatform.pushPrompt.denied'))
    } else {
      toast.info(t('nativePlatform.pushPrompt.unavailable'))
    }
  } catch {
    toast.error(t('nativePlatform.pushPrompt.failed'))
  } finally {
    busy.value = false
    open.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open" :title="t('nativePlatform.pushPrompt.title')" size="sm" @update:open="onOpenChange">
    <div class="flex items-start gap-3.5 pt-1">
      <span class="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-text" aria-hidden="true">
        <Bell class="size-5" />
      </span>
      <p class="min-w-0 text-[13px] leading-relaxed text-muted">{{ t('nativePlatform.pushPrompt.body') }}</p>
    </div>
    <template #footer>
      <Button variant="ghost" :disabled="busy" @click="dismiss">{{ t('nativePlatform.pushPrompt.notNow') }}</Button>
      <Button variant="primary" :loading="busy" @click="allow">{{ t('nativePlatform.pushPrompt.allow') }}</Button>
    </template>
  </Dialog>
</template>
