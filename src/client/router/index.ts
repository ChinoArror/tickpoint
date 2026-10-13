import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { startSignIn } from '@/lib/api'

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean
    titleKey?: string
    transitionKey?: string
  }
}

const AppShell = () => import('@/layouts/AppShell.vue')

const routes: RouteRecordRaw[] = [
  { path: '/signin', component: () => import('@/pages/SignInPage.vue'), meta: { public: true, titleKey: 'auth.signIn' } },
  // AuthCenter redirects here with ?token=...; the page strips it immediately.
  { path: '/sso-callback', component: () => import('@/pages/SsoCallbackPage.vue'), meta: { public: true, titleKey: 'auth.signingIn' } },
  {
    path: '/',
    component: AppShell,
    children: [
      { path: '', component: () => import('@/pages/OverviewPage.vue'), meta: { titleKey: 'nav.overview' } },
      { path: 'inbox', component: () => import('@/pages/TaskListPage.vue'), props: { view: 'inbox' }, meta: { titleKey: 'nav.inbox' } },
      { path: 'today', component: () => import('@/pages/TaskListPage.vue'), props: { view: 'today' }, meta: { titleKey: 'nav.today' } },
      { path: 'upcoming', component: () => import('@/pages/TaskListPage.vue'), props: { view: 'upcoming' }, meta: { titleKey: 'nav.upcoming' } },
      { path: 'deadlines', component: () => import('@/pages/TaskListPage.vue'), props: { view: 'deadlines' }, meta: { titleKey: 'nav.deadlines' } },
      { path: 'completed', component: () => import('@/pages/TaskListPage.vue'), props: { view: 'completed' }, meta: { titleKey: 'nav.completed' } },
      { path: 'archived', component: () => import('@/pages/TaskListPage.vue'), props: { view: 'archived' }, meta: { titleKey: 'nav.archived' } },
      { path: 'tasks/:id', component: () => import('@/pages/TaskDetailPage.vue'), props: true, meta: { titleKey: 'task.detail' } },
      { path: 'goals', component: () => import('@/pages/GoalsPage.vue'), meta: { titleKey: 'nav.goals' } },
      { path: 'goals/:id', component: () => import('@/pages/GoalDetailPage.vue'), props: true, meta: { titleKey: 'nav.goals' } },
      { path: 'projects', component: () => import('@/pages/ProjectsPage.vue'), meta: { titleKey: 'nav.projects' } },
      { path: 'projects/:id', component: () => import('@/pages/ProjectDetailPage.vue'), props: true, meta: { titleKey: 'nav.projects' } },
      { path: 'calendar', component: () => import('@/pages/CalendarPage.vue'), meta: { titleKey: 'nav.calendar' } },
      { path: 'timeline', component: () => import('@/pages/TimelinePage.vue'), meta: { titleKey: 'nav.timeline' } },
      { path: 'analytics', component: () => import('@/pages/AnalyticsPage.vue'), meta: { titleKey: 'nav.analytics' } },
      { path: 'capture', component: () => import('@/pages/SmartCapturePage.vue'), meta: { titleKey: 'nav.capture' } },
      { path: 'capture/:draftId', component: () => import('@/pages/SmartCapturePage.vue'), props: true, meta: { titleKey: 'nav.capture', transitionKey: 'capture' } },
      { path: 'plan/:draftId', component: () => import('@/pages/PlanEditorPage.vue'), props: true, meta: { titleKey: 'plan.title' } },
      { path: 'sources/:id', component: () => import('@/pages/SourcePage.vue'), props: true, meta: { titleKey: 'source.title' } },
      { path: 'notifications', component: () => import('@/pages/NotificationsPage.vue'), meta: { titleKey: 'notifications.title' } },
      { path: 'activity', component: () => import('@/pages/ActivityPage.vue'), meta: { titleKey: 'activity.title' } },
      { path: 'settings', redirect: '/settings/general' },
      { path: 'settings/:section(general|tasks|notifications|ai|account|data)', component: () => import('@/pages/SettingsPage.vue'), props: true, meta: { titleKey: 'nav.settings', transitionKey: 'settings' } },
      { path: ':pathMatch(.*)*', component: () => import('@/pages/NotFoundPage.vue'), meta: { titleKey: 'errors.notFoundTitle' } },
    ],
  },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
})

router.beforeEach(async (to) => {
  if (to.meta.public) return true
  const session = useSessionStore()
  if (session.status === 'idle' || session.status === 'error') {
    try {
      await session.load()
    } catch {
      return true // network error: let the page render its own error state
    }
  }
  if (session.status === 'anonymous') {
    // Returning users (who had a session before) renew silently through AuthCenter;
    // first-time visitors see the sign-in page.
    let hadSession = false
    try {
      hadSession = localStorage.getItem('tp.hadSession') === '1'
    } catch {
      /* ignore */
    }
    if (hadSession) {
      startSignIn(to.fullPath)
      return false
    }
    return { path: '/signin', query: { return: to.fullPath } }
  }
  return true
})
