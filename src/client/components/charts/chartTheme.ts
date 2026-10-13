// Lazy ECharts registration and theme-token resolution shared by every chart.
// ECharts cannot parse oklch(), so token values are normalised through a 1px canvas.

export interface ChartPalette {
  primary: string
  success: string
  warning: string
  danger: string
  info: string
  ai: string
  secondary: string
  fg: string
  muted: string
  subtle: string
  border: string
  surface: string
  surfaceSunken: string
}

const TOKENS: Record<keyof ChartPalette, string> = {
  primary: '--primary',
  success: '--success',
  warning: '--warning',
  danger: '--danger',
  info: '--info',
  ai: '--ai',
  secondary: '--secondary',
  fg: '--text',
  muted: '--text-muted',
  subtle: '--text-subtle',
  border: '--border',
  surface: '--surface',
  surfaceSunken: '--surface-sunken',
}

let canvas: HTMLCanvasElement | null = null

function resolveToken(name: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  if (!raw) return '#888888'
  canvas ??= document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext('2d')
  if (!ctx) return '#888888'
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = '#000000'
  ctx.fillStyle = raw // invalid values are ignored and leave black
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`
}

/** Current theme colours as ECharts-compatible strings. Call again after a theme change. */
export function readPalette(): ChartPalette {
  const out = {} as ChartPalette
  for (const key of Object.keys(TOKENS) as (keyof ChartPalette)[]) out[key] = resolveToken(TOKENS[key])
  return out
}

type VChartComponent = typeof import('vue-echarts').default

let library: Promise<VChartComponent> | null = null

/** Loads ECharts (tree-shaken) and vue-echarts once; subsequent calls reuse the same promise. */
export function loadChartLibrary(): Promise<VChartComponent> {
  library ??= (async () => {
    const [core, charts, components, renderers, vueEcharts] = await Promise.all([
      import('echarts/core'),
      import('echarts/charts'),
      import('echarts/components'),
      import('echarts/renderers'),
      import('vue-echarts'),
    ])
    core.use([
      charts.BarChart,
      charts.LineChart,
      charts.HeatmapChart,
      charts.ScatterChart,
      components.GridComponent,
      components.TooltipComponent,
      components.LegendComponent,
      components.CalendarComponent,
      components.VisualMapComponent,
      components.DataZoomComponent,
      renderers.CanvasRenderer,
    ])
    return vueEcharts.default
  })()
  return library
}
