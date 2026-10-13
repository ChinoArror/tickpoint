# TickPoint UI Guide

The canonical reference for building TickPoint screens. Read the exemplar files before writing a page:

- `src/client/pages/OverviewPage.vue`: page layout, cards, empty states, skeletons, staggered reveal.
- `src/client/components/domain/TaskRow.vue`: list rows, metadata chips, row menus.
- `src/client/components/task/DueEditor.vue`: form controls and validation hints.
- `src/client/layouts/AppShell.vue`: navigation, global overlays.

## Principles

Calm, minimal, information-dense when useful. Linear / Things-like restraint: one indigo accent, neutral cool greys, soft borders, small shadows. No gradients except the logo. AI-generated content uses the `ai` (violet) tone and is always labelled as unconfirmed.

## Tokens (never hard-code colors)

Use Tailwind utilities mapped to CSS variables in `src/client/styles/main.css`:

| Purpose | Classes |
| --- | --- |
| Page background | `bg-bg`, `bg-bg-subtle` |
| Surfaces | `bg-surface`, `bg-surface-raised` (overlays), `bg-surface-sunken` (wells), `hover:bg-surface-hover` |
| Text | `text-fg`, `text-muted`, `text-subtle` |
| Borders | `border-border`, `border-border-strong` |
| Accent | `bg-primary text-on-primary`, `bg-primary-soft text-primary-text`, `bg-primary-softer` |
| Status | `success`, `warning`, `danger`, `info` each with `-soft` and (success/warning/danger) `-text` |
| AI | `bg-ai`, `bg-ai-soft text-ai` |
| Radius | `rounded-lg` (10px controls), `rounded-xl`, `rounded-2xl` (cards/sheets) |
| Shadow | `shadow-xs` (cards), `shadow-md` (hover), `shadow-lg` (overlays) |

Dark mode is automatic through the tokens; do not add `dark:` variants for colors.

Typography: base 14px. Page title `text-2xl font-semibold tracking-tight`. Card title `text-[13px] font-semibold`. Meta text `text-xs text-muted`. Numbers use the `tabular` class.

Page container: `mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8` (use `max-w-3xl`/`4xl` for focused pages such as settings and detail views).

## Components (import from `@/components/...`)

UI kit (`components/ui`):

- `Button`: `variant`: primary | secondary | ghost | soft | danger | danger-ghost | ai. `size`: xs | sm | md | lg | icon | icon-sm. Props: `loading`, `block`.
- `IconButton`: requires `label` (aria).
- `Field`: label/hint/error wrapper; its default slot exposes `{ id, describedby, invalid }`.
- `Input`, `Textarea`, `Select` (`options: {value,label}[]`), `Switch`: all use `v-model`.
- `Badge`: `tone`: neutral | primary | success | warning | danger | info | ai. Optional `dot`.
- `Card`: `title`, `subtitle`, `padded`, `interactive`, plus `#header` and `#actions` slots.
- `Dialog`: `v-model:open`, `title`, `description`, `size`: sm | md | lg | xl, plus a `#footer` slot. Becomes a bottom sheet on mobile automatically.
- `Drawer`: right side drawer on desktop, bottom sheet on mobile.
- `Menu`: dropdown; `items: MenuItem[]` with label / icon / danger / separator / heading / onSelect. The trigger goes in the default slot.
- `Segmented`: animated radio group; `v-model`, `options: {value,label,icon?}[]`, `label` (aria).
- `ProgressBar` (`value`, `max`, `tone`, `expected` marker), `ProgressRing` (`value` 0-100).
- `EmptyState`: `icon`, `title`, `description`, `compact`; actions go in the default slot.
- `Skeleton` (`rows`, `height`), `Spinner`, `Avatar`, `Kbd`, `Tooltip` (`text`).

Domain components (`components/domain`): `TaskRow`, `TaskCheck`, `CountdownChip` (`due`), `RiskBadge` (`risk`, `show-reason`), `PriorityFlag`.

Task components (`components/task`): `DueEditor` (`v-model` DueSpec).

## Composables

- `useFormat()`: `dateTime`, `date(iso)`, `time`, `due(due)`, `relativeDay`, `countdown`, `minutes`, `relativeTime`, `percent`, `number`, and `today` (ISO date in the user's zone). Never format dates by hand.
- `useNow()`: a reactive ticking clock corrected for server time. Use it for countdowns.
- `useTasks.ts`: query keys `qk`, `useTaskList`, `useTaskDetail`, `useDashboard`, `useGoals`, `useGoalDetail`, `useProjects`, `useTags`, `useTaskActions()` (toggleComplete / create / update / transition / remove / duplicate, with undo toasts), `useCheckpointActions()`, `useErrorMessage()`, and `invalidatePlanning(qc)`.
- `useToast()`: `success`, `error`, `info`, `undoable(message, undoLabel, fn)`.
- `confirm({ title, message, danger, confirmLabel, typeToConfirm })`: returns `Promise<boolean>`. Use it for every destructive action.
- `useUiStore()`: `openTask(id)` opens the task drawer, `openQuickAdd(preset)`, `searchOpen`.
- `useSessionStore()`: `me`, `settings`, `updateSettings(patch)`, `signOutLocal()`, `signOutEverywhere()`.
- `api` from `@/lib/api`: `api.get/post/put/patch/del/upload`, which return the envelope's `data` or throw `ApiError {code,status,message,details}`. `downloadUrl(path, query)` handles file downloads.
- Types live in `@/lib/types`. Zod input schemas live in `@shared/schemas`. Constants live in `@shared/constants`.

## Motion

- Pages: the `page` transition is applied by the shell.
- Lists: `<TransitionGroup name="list" tag="div" class="relative">` gives slide-in, collapse-out and glide-to-place.
- Small appear/disappear: `<Transition name="pop">` or `name="fade"`.
- Staggered first paint: put `class="stagger"` on a parent and `:style="{ '--i': index }"` on each child.
- Utility animations: `animate-fade-up`, `animate-scale-in`, `animate-pop`, `skeleton`.
- Hover lift for clickable cards: `Card interactive`.
- Durations come from the tokens (`--dur-fast` 140ms, `--dur` 220ms, `--dur-slow` 380ms), with easing `ease-[var(--ease-out)]` or `ease-[var(--ease-spring)]` for playful pops.
- Reduced motion is handled globally. Never rely on animation to convey state.

## Accessibility (mandatory)

- Every visible string comes from i18n. Never hard-code text, aria-labels included.
- Icon-only buttons need an aria-label (`IconButton label=`).
- Status is never conveyed by color alone: pair it with an icon and text (see RiskBadge and CountdownChip).
- Forms use `Field` with label, hint and error. Destructive actions go through `confirm()`.
- Keyboard: all interactive elements are native buttons or links, or Reka primitives.
- Touch targets are at least 32px (36-44px preferred on mobile). Never hide essential actions behind hover only; row menus use `max-md:opacity-100`.

## Internationalization

- Locales are exactly `en` and `ja`. English is the source of truth.
- Each feature area adds messages in `src/locales/parts/<area>.en.json` and `src/locales/parts/<area>.ja.json`, nested under a top-level key for that area. They are deep-merged at runtime. Reuse existing keys from `src/locales/en.json` (`common.*`, `status.*`, `priority.*`, `risk.*`, `due.*`) instead of duplicating them.
- Japanese must be natural, not literal. Use these terms consistently: 締め切り (deadline), 目標 (goal), タスク (task), チェックポイント (checkpoint), リマインダー (reminder), 進捗 (progress), 完了 (completion), 期限切れ (overdue), 提出 (submission).
- vue-i18n syntax: placeholders use `{name}`. Do not use `|` (plural separator) or `@` in messages.

## Mobile

- The shell provides bottom navigation and a quick-add FAB (mobile pages get 84px of bottom padding automatically).
- Use `useMediaQuery('(min-width: 768px)')` from `@vueuse/core` for desktop/mobile switches.
- Side-by-side desktop layouts collapse into `Segmented` tabs or steps on mobile.
- Dialogs and Drawers automatically become bottom sheets.
