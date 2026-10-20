// Lets non-component code (API client, session store) route the SPA on native
// without importing the router (which would create an import cycle).
import type { Router } from 'vue-router'

let appRouter: Router | null = null

export function bindRouter(router: Router) {
  appRouter = router
}

export function goTo(path: string) {
  if (appRouter) void appRouter.replace(path)
  else location.assign(path)
}
