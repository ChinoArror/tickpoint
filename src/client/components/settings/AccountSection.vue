<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import { Copy, ExternalLink, LogOut, ShieldAlert } from 'lucide-vue-next'
import Avatar from '@/components/ui/Avatar.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import IconButton from '@/components/ui/IconButton.vue'
import { confirm } from '@/composables/useConfirm'
import { useToast } from '@/composables/useToast'
import { useErrorMessage } from '@/composables/useTasks'
import { useSessionStore } from '@/stores/session'

const { t } = useI18n()
const router = useRouter()
const qc = useQueryClient()
const session = useSessionStore()
const toast = useToast()
const errMsg = useErrorMessage()

const user = computed(() => session.me?.user)
const displayName = computed(() => user.value?.name ?? user.value?.username ?? '')
const roleLabel = computed(() => (user.value?.role === 'admin' ? t('settingsPage.account.roles.admin') : t('settingsPage.account.roles.user')))
const identityLabel = computed(() => (user.value?.identityType === 'test' ? t('settingsPage.account.identities.test') : t('settingsPage.account.identities.user')))

async function copyUuid() {
  const uuid = user.value?.uuid
  if (!uuid) return
  try {
    await navigator.clipboard.writeText(uuid)
    toast.success(t('common.copied'))
  } catch (e) {
    toast.error(errMsg(e))
  }
}

async function signOutTickPoint() {
  try {
    await session.signOutLocal()
    qc.clear()
    void router.replace('/signin?signedOut=1')
  } catch (e) {
    toast.error(errMsg(e))
  }
}

async function signOutEverywhere() {
  const ok = await confirm({
    title: t('settingsPage.account.everywhereConfirmTitle'),
    message: t('account.signOutEverywhereHint'),
    confirmLabel: t('settingsPage.account.everywhereConfirm'),
    danger: true,
  })
  if (!ok) return
  try {
    await session.signOutEverywhere()
  } catch (e) {
    toast.error(errMsg(e))
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <Card :title="t('settingsPage.account.title')" :subtitle="t('settingsPage.account.subtitle')" :padded="true">
      <div class="flex flex-col gap-5 sm:flex-row sm:items-start">
        <Avatar :src="user?.avatarUrl" :name="displayName" :size="64" />
        <dl class="grid min-w-0 flex-1 grid-cols-1 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2">
          <div class="min-w-0">
            <dt class="text-xs text-subtle">{{ t('settingsPage.account.name') }}</dt>
            <dd class="truncate font-medium text-fg">{{ displayName || '—' }}</dd>
          </div>
          <div class="min-w-0">
            <dt class="text-xs text-subtle">{{ t('settingsPage.account.email') }}</dt>
            <dd class="truncate font-medium text-fg">{{ user?.email ?? '—' }}</dd>
          </div>
          <div>
            <dt class="text-xs text-subtle">{{ t('settingsPage.account.role') }}</dt>
            <dd class="mt-0.5"><Badge tone="primary" size="sm">{{ roleLabel }}</Badge></dd>
          </div>
          <div>
            <dt class="text-xs text-subtle">{{ t('settingsPage.account.identity') }}</dt>
            <dd class="mt-0.5"><Badge size="sm">{{ identityLabel }}</Badge></dd>
          </div>
          <div class="min-w-0 sm:col-span-2">
            <dt class="text-xs text-subtle">{{ t('settingsPage.account.uuid') }}</dt>
            <dd class="mt-0.5 flex min-w-0 items-center gap-2">
              <code class="tabular min-w-0 truncate rounded-md bg-surface-sunken px-2 py-1 font-mono text-xs text-muted">{{ user?.uuid ?? '—' }}</code>
              <IconButton v-if="user?.uuid" :label="t('settingsPage.account.copyUuid')" size="sm" @click="copyUuid"><Copy /></IconButton>
            </dd>
          </div>
        </dl>
      </div>

      <div class="mt-5 border-t border-border pt-4">
        <a :href="session.me?.profileUrl" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary-text hover:underline">
          {{ t('settingsPage.account.manage') }}
          <ExternalLink class="size-3.5" aria-hidden="true" />
          <span class="sr-only">{{ t('common.open') }}</span>
        </a>
      </div>
    </Card>

    <Card :title="t('settingsPage.account.signOutTitle')" :subtitle="t('settingsPage.account.signOutSubtitle')" :padded="true">
      <div class="flex flex-col gap-5">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p class="max-w-md text-xs leading-relaxed text-muted">{{ t('settingsPage.account.signOutTickPointHint') }}</p>
          <Button variant="secondary" class="shrink-0" @click="signOutTickPoint"><LogOut class="size-4" aria-hidden="true" />{{ t('account.signOutTickPoint') }}</Button>
        </div>
        <div class="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p class="max-w-md text-xs leading-relaxed text-muted">
            <ShieldAlert class="mr-1 inline size-3.5 align-[-2px] text-warning" aria-hidden="true" />{{ t('settingsPage.account.signOutEverywhereHint') }}
          </p>
          <Button variant="danger-ghost" class="shrink-0" @click="signOutEverywhere"><LogOut class="size-4" aria-hidden="true" />{{ t('account.signOutEverywhere') }}</Button>
        </div>
      </div>
    </Card>
  </div>
</template>
