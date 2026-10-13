import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'

const alias = {
  '@': fileURLToPath(new URL('./src/client', import.meta.url)),
  '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
  '@locales': fileURLToPath(new URL('./src/locales', import.meta.url)),
}

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [vue()],
        resolve: { alias },
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        resolve: { alias },
        plugins: [
          cloudflareTest(async () => ({
            main: './src/server/index.ts',
            miniflare: {
              compatibilityDate: '2026-09-01',
              compatibilityFlags: ['nodejs_compat'],
              d1Databases: ['DB'],
              r2Buckets: ['FILES'],
              bindings: {
                APP_ENV: 'test',
                APP_ORIGIN: 'http://localhost',
                AUTH_BASE_URL: 'https://accounts.example.test',
                AUTH_APP_ID: 'tickpoint',
                AUTH_CALLBACK_URL: 'http://localhost/sso-callback',
                AUTH_APP_SECRET: 'test-app-secret-not-real',
                GEMINI_MODEL: 'gemini-test',
                GEMINI_API_KEY: 'test-gemini-key-not-real',
                VAPID_PUBLIC_KEY: '',
                VAPID_SUBJECT: 'mailto:test@example.test',
                EMAIL_PROVIDER: 'none',
                EMAIL_FROM: 'TickPoint <noreply@example.test>',
                TEST_MIGRATIONS: await readD1Migrations('./migrations'),
              },
            },
          })),
        ],
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          setupFiles: ['./tests/integration/setup.ts'],
        },
      },
    ],
  },
})
