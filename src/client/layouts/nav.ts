import type { Component } from 'vue'
import {
  BarChart3,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  FolderKanban,
  GanttChart,
  Home,
  Inbox,
  Settings,
  Sparkles,
  Sun,
  Target,
  Timer,
} from 'lucide-vue-next'

export interface NavItem {
  to: string
  key: string
  icon: Component
  group: 'main' | 'plan' | 'insight'
}

export const NAV: NavItem[] = [
  { to: '/', key: 'overview', icon: Home, group: 'main' },
  { to: '/inbox', key: 'inbox', icon: Inbox, group: 'main' },
  { to: '/today', key: 'today', icon: Sun, group: 'main' },
  { to: '/upcoming', key: 'upcoming', icon: CalendarClock, group: 'main' },
  { to: '/deadlines', key: 'deadlines', icon: Timer, group: 'plan' },
  { to: '/goals', key: 'goals', icon: Target, group: 'plan' },
  { to: '/projects', key: 'projects', icon: FolderKanban, group: 'plan' },
  { to: '/calendar', key: 'calendar', icon: CalendarDays, group: 'plan' },
  { to: '/timeline', key: 'timeline', icon: GanttChart, group: 'plan' },
  { to: '/analytics', key: 'analytics', icon: BarChart3, group: 'insight' },
  { to: '/capture', key: 'capture', icon: Sparkles, group: 'insight' },
  { to: '/settings', key: 'settings', icon: Settings, group: 'insight' },
]

export const MOBILE_NAV = [
  { to: '/', key: 'home', icon: Home },
  { to: '/today', key: 'tasks', icon: Sun },
  { to: '/calendar', key: 'calendar', icon: CalendarRange },
  { to: '/goals', key: 'goals', icon: Target },
]

/** Routes that belong to the bottom "Tasks" tab. */
export const TASK_VIEW_PATHS = ['/inbox', '/today', '/upcoming', '/deadlines', '/completed', '/archived']
