// Contract between the Vue app and a native shell (Capacitor). The web build uses
// `none.ts` (null). The Android build aliases `@native-platform` to its implementation.
import type { Router } from 'vue-router'

export type NativePushStatus = 'granted' | 'denied' | 'prompt' | 'unavailable'

export interface NativeTermsAcceptance {
  version: string
  acceptedAt: number
}

export interface NativePlatform {
  /** Absolute API base, e.g. https://point.aryuki.com/api/v1 */
  readonly apiBase: string
  /** Bearer token for API calls, or null when signed out. */
  getAuthToken(): Promise<string | null>
  /** Runs the Custom Tab PKCE sign-in. Resolves when finished, throws on failure. */
  signIn(returnTo: string): Promise<void>
  /** Unregisters the device, clears the token and performs the central logout. */
  signOut(opts: { authBaseUrl: string }): Promise<void>
  /** Caches the file and opens the Android share sheet. */
  saveFile(blob: Blob, filename: string): Promise<void>
  openExternal(url: string): Promise<void>
  push: {
    status(): Promise<NativePushStatus>
    enable(): Promise<'granted' | 'denied' | 'unavailable'>
    disable(): Promise<void>
    openSettings(): Promise<void>
  }
  terms: {
    accepted(): Promise<NativeTermsAcceptance | null>
    accept(version: string): Promise<void>
    /** Closes the app. */
    decline(): Promise<void>
  }
  readonly appVersion: string
  /** Back button, deep links, push taps and lifecycle. */
  init(ctx: { router: Router; onSessionChanged: () => void }): Promise<void>
}
