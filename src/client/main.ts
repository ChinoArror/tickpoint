import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
import App from './App.vue'
import { router } from './router'
import { i18n, initialLocale } from './i18n'
import { initTheme } from './composables/useTheme'
import { ApiError } from './lib/api'
import { isNative, native } from './platform'
import { recordTermsAcceptance } from './platform/terms'
import { useSessionStore } from './stores/session'
import './styles/main.css'

initTheme()
document.documentElement.lang = initialLocale
// CSS hook for the Android shell (safe-area and touch tweaks only).
if (isNative) document.documentElement.classList.add('native')

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
})

// Service workers are registered by PwaPrompt, which App.vue renders only in browsers.
const app = createApp(App).use(createPinia()).use(router).use(i18n).use(VueQueryPlugin, { queryClient })

async function start() {
  if (native) {
    // Back button, deep links and push taps are wired before the first render.
    try {
      await native.init({
        router,
        onSessionChanged: () => {
          void useSessionStore().load().catch(() => undefined)
          void recordTermsAcceptance()
        },
      })
    } catch {
      /* a failed shell hook must not leave a blank screen */
    }
  }
  app.mount('#app')
}

void start()
