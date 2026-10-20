import { fileURLToPath, URL } from 'node:url'
import path from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'

// Builds the ROOT Vue app for the Android WebView. Everything Capacitor-specific comes
// from '@native-platform' (android-app/src/native) instead of the web stub. No PWA
// service worker and no Cloudflare plugin: the APK serves the bundle from its assets.
const here = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = path.resolve(here, '..')
const appVersion = JSON.parse(readFileSync(path.resolve(here, 'package.json'), 'utf8')).version as string

export default defineConfig({
  root: repoRoot,
  // Keep the app's own public/ (icons, .well-known) in the bundle.
  publicDir: path.resolve(repoRoot, 'public'),
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
  },
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(repoRoot, 'src/client'),
      '@shared': path.resolve(repoRoot, 'src/shared'),
      '@locales': path.resolve(repoRoot, 'src/locales'),
      '@native-platform': path.resolve(here, 'src/native/index.ts'),
      // No VitePWA in the Android build; PwaPrompt.vue (browser only) gets an inert stub.
      'virtual:pwa-register/vue': path.resolve(here, 'src/native/pwa-register-stub.ts'),
    },
    dedupe: ['@capacitor/core'],
  },
  build: {
    outDir: path.resolve(here, 'www'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/echarts') || id.includes('node_modules/zrender')) return 'charts'
          if (id.includes('node_modules/@fullcalendar')) return 'calendar'
        },
      },
    },
  },
})
