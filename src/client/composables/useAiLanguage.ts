import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Locale } from '@shared/constants'

/** Map the interface locale tag onto the two languages the AI endpoints accept. */
export function toAiLanguage(tag: string | null | undefined): Locale {
  return tag?.toLowerCase().startsWith('ja') ? 'ja' : 'en'
}

/**
 * Per-instance AI output language. Follows the page display language until the
 * user picks a value in this instance; nothing is persisted across page loads.
 */
export function useAiLanguage() {
  const { locale } = useI18n()
  const picked = ref<Locale | null>(null)
  const outputLanguage = computed<Locale>({
    get: () => picked.value ?? toAiLanguage(locale.value),
    set: (v) => {
      picked.value = v
    },
  })
  return outputLanguage
}
