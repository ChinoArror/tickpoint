// Router and session callbacks handed over by main.ts through NativePlatform.init().
import type { Router } from 'vue-router'

export const hooks: { router: Router | null; onSessionChanged: (() => void) | null } = {
  router: null,
  onSessionChanged: null,
}

export function notifySessionChanged(): void {
  hooks.onSessionChanged?.()
}
