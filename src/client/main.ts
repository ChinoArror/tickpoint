import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
import App from './App.vue'
import { router } from './router'
import { i18n, initialLocale } from './i18n'
import { initTheme } from './composables/useTheme'
import { ApiError } from './lib/api'
import './styles/main.css'

initTheme()
document.documentElement.lang = initialLocale

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
})

createApp(App).use(createPinia()).use(router).use(i18n).use(VueQueryPlugin, { queryClient }).mount('#app')
