// Shared save behaviour for settings controls. Changes go through the session
// store, which applies them optimistically and reverts on failure.

import { computed, reactive, type WritableComputedRef } from 'vue'
import { useSessionStore } from '@/stores/session'
import { useToast } from '@/composables/useToast'
import { useErrorMessage } from '@/composables/useTasks'
import type { Settings } from '@/lib/types'

/** Global indicator state for the "Saving / Saved" hint shown in the settings header. */
export const saveState = reactive<{ status: 'idle' | 'saving' | 'saved' }>({ status: 'idle' })
let hideTimer: ReturnType<typeof setTimeout> | undefined

export function useSettingSave() {
  const session = useSessionStore()
  const toast = useToast()
  const errMsg = useErrorMessage()

  async function save(patch: Partial<Settings>): Promise<boolean> {
    saveState.status = 'saving'
    try {
      await session.updateSettings(patch)
      saveState.status = 'saved'
      clearTimeout(hideTimer)
      hideTimer = setTimeout(() => (saveState.status = 'idle'), 1800)
      return true
    } catch (e) {
      saveState.status = 'idle'
      toast.error(errMsg(e))
      return false
    }
  }

  /** Two-way binding to a single setting. Reads the store, writes through save(). */
  function field<K extends keyof Settings>(key: K): WritableComputedRef<Settings[K]> {
    return computed({
      get: () => session.settings?.[key] as Settings[K],
      set: (v: Settings[K]) => {
        void save({ [key]: v } as Partial<Settings>)
      },
    })
  }

  return { session, save, field }
}
