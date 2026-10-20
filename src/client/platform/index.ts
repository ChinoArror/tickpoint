import { nativePlatform } from '@native-platform'
import type { NativePlatform } from './types'

export type { NativePlatform, NativePushStatus, NativeTermsAcceptance } from './types'
export { bindRouter, goTo } from './navigate'

/** The native shell, or null in a browser. */
export const native: NativePlatform | null = nativePlatform
/** True inside the Android (Capacitor) app. */
export const isNative: boolean = nativePlatform !== null

export function apiBase(): string {
  return nativePlatform?.apiBase ?? '/api/v1'
}
