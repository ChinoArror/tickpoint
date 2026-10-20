// The Android build has no service worker. PwaPrompt.vue (browser only) imports this virtual
// module, so give it an inert implementation instead of the VitePWA one.
import { ref } from 'vue'

export function useRegisterSW(_options?: unknown) {
  return {
    needRefresh: ref(false),
    offlineReady: ref(false),
    updateServiceWorker: async (_reloadPage?: boolean) => undefined,
  }
}
