import { useI18n } from 'vue-i18n'
import { Activity, CheckCircle2, HelpCircle, Moon, Shuffle, Target, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-vue-next'
import { useFormat } from '@/composables/useFormat'
import type { Goal } from '@/lib/types'
import type { GoalProgressModel, ReviewFrequency } from '@shared/constants'

/** Values a goal form can be pre-filled with (e.g. from the empty-state examples). */
export interface GoalPrefill {
  title?: string
  progressModel?: GoalProgressModel
  targetValue?: number
  unit?: string
  projectId?: string | null
}

export type OutlookTone = 'neutral' | 'primary' | 'success' | 'warning' | 'info'

export interface OutlookMeta {
  tone: OutlookTone
  icon: LucideIcon
  text: string
}

/** Shared presentation helpers for goals (list cards, detail page, form). */
export function useGoalFormat() {
  const { t } = useI18n()
  const f = useFormat()

  function modelLabel(m: GoalProgressModel): string {
    return t(`goals.model.${m}.label`)
  }

  function modelHint(m: GoalProgressModel): string {
    return t(`goals.model.${m}.hint`)
  }

  function reviewLabel(r: ReviewFrequency): string {
    return t(`goals.reviewFrequency.${r}`)
  }

  /** Model-specific progress line, e.g. "120 / 300 pages", "45%", "Done". */
  function progressText(g: Goal): string {
    switch (g.progressModel) {
      case 'quantity':
      case 'time': {
        const unit = g.progressModel === 'time' ? ' h' : g.unit ? ` ${g.unit}` : ''
        return t('goalPage.progress.quantity', { current: f.number(g.currentValue, 1), target: f.number(g.targetValue ?? 0, 1), unit })
      }
      case 'percentage':
        return t('goalPage.progress.percent', { value: f.number(g.currentValue, 0) })
      case 'checkpoint':
      case 'weighted':
        return t('goalPage.progress.byCheckpoints', { percent: f.percent(g.health.actual) })
      case 'binary':
        return g.health.actual >= 1 ? t('goalPage.progress.binaryDone') : t('goalPage.progress.binaryOpen')
    }
  }

  function outlookMeta(outlook: Goal['health']['outlook']): OutlookMeta {
    const text = t(`goals.outlook.${outlook}`)
    switch (outlook) {
      case 'completed':
        return { tone: 'success', icon: CheckCircle2, text }
      case 'ahead':
        return { tone: 'success', icon: TrendingUp, text }
      case 'on_pace':
        return { tone: 'primary', icon: Target, text }
      case 'behind':
        return { tone: 'warning', icon: TrendingDown, text }
      case 'consistent':
        return { tone: 'info', icon: Activity, text }
      case 'irregular':
        return { tone: 'neutral', icon: Shuffle, text }
      case 'inactive':
        return { tone: 'neutral', icon: Moon, text }
      default:
        return { tone: 'neutral', icon: HelpCircle, text }
    }
  }

  function ringTone(g: Goal): 'primary' | 'success' | 'warning' {
    if (g.health.outlook === 'completed' || g.health.outlook === 'ahead') return 'success'
    if (g.health.outlook === 'behind') return 'warning'
    return 'primary'
  }

  return { modelLabel, modelHint, reviewLabel, progressText, outlookMeta, ringTone }
}
