// Native helper plugins implemented in Java under android/app/src/main/java/com/aryuki/tickpoint.
import { registerPlugin } from '@capacitor/core'

export interface SecureStorePlugin {
  get(options: { key: string }): Promise<{ value: string | null }>
  set(options: { key: string; value: string }): Promise<void>
  remove(options: { key: string }): Promise<void>
}

export type PushSupportReason = 'ok' | 'no_firebase' | 'no_gms' | 'unknown'

export interface AppSettingsPlugin {
  /** Opens this app's notification settings page in Android settings. */
  openNotificationSettings(): Promise<void>
  /** Whether FCM can work on this device: Firebase is configured and Play services are present. */
  pushSupport(): Promise<{ available: boolean; reason: PushSupportReason }>
}

/** AES-256-GCM values in the Android Keystore. Only keys under the `tp.` prefix are accepted. */
export const SecureStore = registerPlugin<SecureStorePlugin>('SecureStore')
export const AppSettings = registerPlugin<AppSettingsPlugin>('AppSettings')
