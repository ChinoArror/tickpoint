<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { AtSign, CheckCircle2, Clock, Mail, MailCheck, MoreHorizontal, Plus, RotateCw, ShieldAlert, Trash2 } from 'lucide-vue-next'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Field from '@/components/ui/Field.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Input from '@/components/ui/Input.vue'
import Menu, { type MenuItem } from '@/components/ui/Menu.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Switch from '@/components/ui/Switch.vue'
import { api, ApiError } from '@/lib/api'
import type { Recipient } from '@/lib/types'
import { confirm as confirmDialog } from '@/composables/useConfirm'
import { useErrorMessage } from '@/composables/useTasks'
import { useNow } from '@/composables/useNow'
import { useToast } from '@/composables/useToast'

interface RecipientList {
  items: Recipient[]
  max: number
  emailConfigured: boolean
}

const KEY = ['notification-emails'] as const
const COOLDOWN_SECONDS = 60
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const { t, te } = useI18n()
const route = useRoute()
const router = useRouter()
const qc = useQueryClient()
const toast = useToast()
const errMsg = useErrorMessage()
const now = useNow()

const list = useQuery({
  queryKey: KEY,
  queryFn: ({ signal }) => api.get<RecipientList>('/notification-emails', undefined, signal),
})

const items = computed(() => list.data.value?.items ?? [])
const max = computed(() => list.data.value?.max ?? 0)
const emailConfigured = computed(() => list.data.value?.emailConfigured !== false)
const hasVerified = computed(() => items.value.some((r) => r.verified))
/** Additional addresses the user added; the account email does not count toward the limit. */
const userCount = computed(() => items.value.filter((r) => r.source === 'user').length)
const atLimit = computed(() => max.value > 0 && userCount.value >= max.value)

/** Maps an API error to a friendly message, preferring this area's own wording. */
function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    const key = `emailRecipients.errors.${e.code}`
    if (te(key)) return t(key)
  }
  return errMsg(e)
}

function cooldownLeft(r: Recipient): number {
  if (!r.lastSentAt) return 0
  return Math.max(0, Math.ceil((r.lastSentAt + COOLDOWN_SECONDS * 1000 - now.value) / 1000))
}
function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

// ---- Adding -----------------------------------------------------------------
const addressDraft = ref('')
const addError = ref<string | null>(null)
const addHint = computed(() => (atLimit.value ? t('emailRecipients.addLimit') : t('emailRecipients.addHint')))

const addMutation = useMutation({
  mutationFn: (address: string) => api.post<Recipient>('/notification-emails', { address }),
  onSuccess: (r) => {
    addressDraft.value = ''
    addError.value = null
    openCode(r.id)
    toast.success(t('emailRecipients.codeSent', { address: r.address }))
    void qc.invalidateQueries({ queryKey: KEY })
  },
  onError: (e) => {
    addError.value = errorText(e)
  },
})

function submitAdd() {
  const address = addressDraft.value.trim()
  if (!EMAIL_RE.test(address)) {
    addError.value = t('emailRecipients.invalidAddress')
    return
  }
  addError.value = null
  addMutation.mutate(address)
}

// ---- Code entry -------------------------------------------------------------
const codeOpenId = ref<string | null>(null)
const digits = ref<string[]>(Array<string>(6).fill(''))
const verifyError = ref<string | null>(null)
const justVerifiedId = ref<string | null>(null)
const otpInputs: HTMLInputElement[] = []
const codeComplete = computed(() => digits.value.every((d) => d !== ''))

function setOtpRef(el: unknown, i: number) {
  if (el instanceof HTMLInputElement) otpInputs[i] = el
}

function openCode(id: string) {
  codeOpenId.value = id
  digits.value = Array<string>(6).fill('')
  verifyError.value = null
  void nextTick(() => otpInputs[0]?.focus())
}

function closeCode() {
  codeOpenId.value = null
  verifyError.value = null
}

/** Fills boxes from `start` with the digits in `text`, ignoring anything that is not a digit. */
function fillFrom(start: number, text: string) {
  const chars = text.replace(/\D/g, '')
  let last = start
  for (let k = 0; k < chars.length && start + k < 6; k++) {
    digits.value[start + k] = chars[k]
    last = start + k
  }
  void nextTick(() => otpInputs[Math.min(last + 1, 5)]?.focus())
}

function onDigitInput(i: number, e: Event) {
  const el = e.target as HTMLInputElement
  let value = el.value.replace(/\D/g, '')
  // Typing into a filled box yields "old+new"; keep only the new digit.
  const prev = digits.value[i]
  if (value.length > 1 && prev && value.startsWith(prev)) value = value.slice(prev.length)
  if (value.length > 1) {
    fillFrom(i, value)
  } else {
    digits.value[i] = value
    if (value && i < 5) otpInputs[i + 1]?.focus()
  }
  el.value = digits.value[i]
}

function onDigitKeydown(i: number, e: KeyboardEvent) {
  if (e.key === 'Backspace' && !digits.value[i] && i > 0) {
    e.preventDefault()
    digits.value[i - 1] = ''
    otpInputs[i - 1]?.focus()
  } else if (e.key === 'ArrowLeft' && i > 0) {
    e.preventDefault()
    otpInputs[i - 1]?.focus()
  } else if (e.key === 'ArrowRight' && i < 5) {
    e.preventDefault()
    otpInputs[i + 1]?.focus()
  }
}

function onPaste(i: number, e: ClipboardEvent) {
  e.preventDefault()
  fillFrom(i, e.clipboardData?.getData('text') ?? '')
}

const verifyMutation = useMutation({
  mutationFn: ({ id, code }: { id: string; code: string }) => api.post<Recipient>(`/notification-emails/${id}/verify`, { code }),
  onSuccess: (r) => {
    closeCode()
    justVerifiedId.value = r.id
    setTimeout(() => {
      if (justVerifiedId.value === r.id) justVerifiedId.value = null
    }, 1600)
    toast.success(t('emailRecipients.verifiedToast', { address: r.address }))
    void qc.invalidateQueries({ queryKey: KEY })
  },
  onError: (e) => {
    if (e instanceof ApiError && e.code === 'VERIFICATION_FAILED') {
      const d = (e.details ?? {}) as { reason?: string; attemptsLeft?: number }
      const reasonKey = d.reason ? `emailRecipients.reason.${d.reason}` : ''
      const reason = reasonKey && te(reasonKey) ? t(reasonKey) : errorText(e)
      const left = typeof d.attemptsLeft === 'number' ? ` ${t('emailRecipients.attemptsLeft', { count: d.attemptsLeft })}` : ''
      verifyError.value = `${reason}${left}`
    } else {
      verifyError.value = errorText(e)
    }
    digits.value = Array<string>(6).fill('')
    void nextTick(() => otpInputs[0]?.focus())
  },
})

function submitCode(id: string) {
  if (!codeComplete.value) {
    verifyError.value = t('emailRecipients.codeIncomplete')
    return
  }
  verifyError.value = null
  verifyMutation.mutate({ id, code: digits.value.join('') })
}

const resendMutation = useMutation({
  mutationFn: (id: string) => api.post<Recipient>(`/notification-emails/${id}/resend`),
  onSuccess: (r) => {
    openCode(r.id)
    toast.success(t('emailRecipients.codeResent', { address: r.address }))
    void qc.invalidateQueries({ queryKey: KEY })
  },
  onError: (e) => toast.error(errorText(e)),
})

// ---- Enable / remove --------------------------------------------------------
const toggleMutation = useMutation({
  mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => api.patch<Recipient>(`/notification-emails/${id}`, { enabled }),
  onMutate: async ({ id, enabled }) => {
    await qc.cancelQueries({ queryKey: KEY })
    const prev = qc.getQueryData<RecipientList>(KEY)
    if (prev) qc.setQueryData<RecipientList>(KEY, { ...prev, items: prev.items.map((r) => (r.id === id ? { ...r, enabled } : r)) })
    return { prev }
  },
  onError: (e, _vars, ctx) => {
    if (ctx?.prev) qc.setQueryData(KEY, ctx.prev)
    toast.error(errorText(e))
  },
  onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
})

const removeMutation = useMutation({
  mutationFn: (id: string) => api.del(`/notification-emails/${id}`),
  onSuccess: () => {
    toast.success(t('emailRecipients.removed'))
    void qc.invalidateQueries({ queryKey: KEY })
  },
  onError: (e) => toast.error(errorText(e)),
})

async function remove(r: Recipient) {
  const ok = await confirmDialog({
    title: t('emailRecipients.removeTitle', { address: r.address }),
    message: t('emailRecipients.removeMessage'),
    danger: true,
    confirmLabel: t('emailRecipients.removeConfirm'),
  })
  if (!ok) return
  if (codeOpenId.value === r.id) closeCode()
  removeMutation.mutate(r.id)
}

function rowMenu(r: Recipient): MenuItem[] {
  const menu: MenuItem[] = []
  if (!r.verified) {
    menu.push({
      label: t('emailRecipients.resend'),
      icon: RotateCw,
      disabled: cooldownLeft(r) > 0 || resendMutation.isPending.value,
      onSelect: () => resendMutation.mutate(r.id),
    })
  }
  if (r.source === 'user') {
    if (menu.length) menu.push({ separator: true })
    menu.push({ label: t('emailRecipients.remove'), icon: Trash2, danger: true, onSelect: () => void remove(r) })
  }
  return menu
}

// ---- Deep link from the verification email ----------------------------------
onMounted(() => {
  const id = typeof route.query.verifyEmail === 'string' ? route.query.verifyEmail : ''
  const code = typeof route.query.code === 'string' ? route.query.code : ''
  if (!id) return
  // Remove the one-time parameters from the address bar before anything else.
  const query = { ...route.query }
  delete query.verifyEmail
  delete query.code
  void router.replace({ path: route.path, query, hash: route.hash })

  openCode(id)
  if (/^\d{6}$/.test(code)) {
    fillFrom(0, code)
    verifyMutation.mutate({ id, code })
  }
})
</script>

<template>
  <section class="flex flex-col gap-4 py-4" :aria-labelledby="'email-recipients-title'">
    <header class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h3 id="email-recipients-title" class="text-[13px] font-semibold text-fg">{{ t('emailRecipients.title') }}</h3>
        <p class="mt-0.5 text-xs leading-relaxed text-muted">{{ t('emailRecipients.hint') }}</p>
      </div>
      <span v-if="max > 0" class="tabular shrink-0 text-xs text-muted" :aria-label="t('emailRecipients.countLabel', { count: userCount, max })">
        {{ t('emailRecipients.count', { count: userCount, max }) }}
      </span>
    </header>

    <p v-if="list.isError.value" class="text-sm text-danger-text" role="alert">{{ t('errors.loadFailed') }}</p>
    <Skeleton v-else-if="list.isPending.value" :rows="2" height="40px" />

    <template v-else>
      <p v-if="!emailConfigured" class="rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning-text" role="status">
        {{ t('emailRecipients.notConfigured') }}
      </p>

      <div v-if="!hasVerified" class="flex gap-3 rounded-xl border border-warning/30 bg-warning-soft/60 p-3.5" role="note">
        <ShieldAlert class="mt-0.5 size-4 shrink-0 text-warning-text" aria-hidden="true" />
        <div class="min-w-0">
          <p class="text-[13px] font-semibold text-fg">{{ t('emailRecipients.calloutTitle') }}</p>
          <p class="mt-0.5 text-xs leading-relaxed text-muted">{{ t('emailRecipients.calloutBody') }}</p>
        </div>
      </div>

      <form class="flex flex-col gap-1.5" novalidate @submit.prevent="submitAdd">
        <Field :label="t('emailRecipients.addLabel')" :hint="addHint" :error="addError" v-slot="{ id, describedby, invalid }">
          <div class="flex gap-2">
            <Input
              :id="id"
              v-model="addressDraft"
              type="email"
              inputmode="email"
              autocomplete="email"
              :placeholder="t('emailRecipients.addPlaceholder')"
              :disabled="atLimit || addMutation.isPending.value"
              :invalid="invalid"
              :aria-describedby="describedby"
              class="min-w-0 flex-1"
            />
            <Button type="submit" variant="secondary" :loading="addMutation.isPending.value" :disabled="atLimit || !addressDraft.trim()">
              <Plus class="size-4" aria-hidden="true" />{{ t('emailRecipients.addButton') }}
            </Button>
          </div>
        </Field>
      </form>

      <TransitionGroup name="list" tag="div" class="relative flex flex-col">
        <div v-for="r in items" :key="r.id" class="border-b border-border/60 py-3 first:pt-0 last:border-0 last:pb-0">
          <div class="flex items-center gap-3">
            <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-sunken text-muted" aria-hidden="true">
              <MailCheck v-if="r.verified" class="size-4" />
              <Mail v-else class="size-4" />
            </span>

            <div class="min-w-0 flex-1">
              <p class="truncate text-[13px] font-medium text-fg" :title="r.address">{{ r.address }}</p>
              <div class="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge v-if="r.source === 'account'" tone="primary" size="sm"><AtSign aria-hidden="true" />{{ t('emailRecipients.accountBadge') }}</Badge>
                <Badge v-else-if="r.verified" tone="success" size="sm">
                  <CheckCircle2 aria-hidden="true" :class="justVerifiedId === r.id ? 'animate-pop' : ''" />{{ t('emailRecipients.verified') }}
                </Badge>
                <Badge v-else tone="warning" size="sm"><Clock aria-hidden="true" />{{ t('emailRecipients.pending') }}</Badge>
              </div>
            </div>

            <div class="flex shrink-0 items-center gap-2">
              <Switch
                :model-value="r.enabled"
                :disabled="!r.verified || toggleMutation.isPending.value"
                :label="t('emailRecipients.deliverLabel', { address: r.address })"
                @update:model-value="(v: boolean) => toggleMutation.mutate({ id: r.id, enabled: v })"
              />
              <Menu v-if="rowMenu(r).length" :items="rowMenu(r)">
                <IconButton :label="t('emailRecipients.rowActions', { address: r.address })" size="sm">
                  <MoreHorizontal class="size-4" />
                </IconButton>
              </Menu>
            </div>
          </div>

          <div v-if="!r.verified" class="mt-3 pl-11">
            <form v-if="codeOpenId === r.id" class="flex flex-col gap-2.5 rounded-xl bg-surface-sunken p-3" novalidate @submit.prevent="submitCode(r.id)">
              <p :id="`email-code-${r.id}`" class="text-xs text-muted">{{ t('emailRecipients.codeTitle', { address: r.address }) }}</p>
              <div role="group" :aria-labelledby="`email-code-${r.id}`" class="flex gap-1.5 sm:gap-2">
                <input
                  v-for="(d, i) in digits"
                  :key="i"
                  :ref="(el) => setOtpRef(el, i)"
                  :value="d"
                  type="text"
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  :aria-label="t('emailRecipients.digit', { n: i + 1 })"
                  :disabled="verifyMutation.isPending.value"
                  :aria-invalid="verifyError ? true : undefined"
                  class="tabular h-11 w-10 min-w-0 rounded-lg border border-border bg-surface text-center text-base font-semibold text-fg shadow-xs outline-none transition-[border-color,box-shadow] duration-150 hover:border-border-strong focus:border-primary focus:ring-3 focus:ring-[var(--focus-ring)] aria-invalid:border-danger sm:w-11"
                  @input="onDigitInput(i, $event)"
                  @keydown="onDigitKeydown(i, $event as KeyboardEvent)"
                  @paste="onPaste(i, $event as ClipboardEvent)"
                  @focus="($event.target as HTMLInputElement).select()"
                />
              </div>
              <p v-if="verifyError" class="text-xs text-danger-text" role="alert">{{ verifyError }}</p>
              <div class="flex flex-wrap items-center gap-2">
                <Button type="submit" variant="primary" size="sm" :loading="verifyMutation.isPending.value" :disabled="!codeComplete">
                  {{ t('emailRecipients.verify') }}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  :disabled="cooldownLeft(r) > 0 || resendMutation.isPending.value"
                  @click="resendMutation.mutate(r.id)"
                >
                  {{ cooldownLeft(r) > 0 ? t('emailRecipients.resendIn', { time: clock(cooldownLeft(r)) }) : t('emailRecipients.resend') }}
                </Button>
                <Button variant="ghost" size="sm" @click="closeCode">{{ t('common.cancel') }}</Button>
              </div>
            </form>
            <Button v-else variant="soft" size="sm" @click="openCode(r.id)">{{ t('emailRecipients.enterCode') }}</Button>
          </div>
        </div>
      </TransitionGroup>
    </template>
  </section>
</template>
