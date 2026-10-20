import type { CapacitorConfig } from '@capacitor/cli'

// The compiled Vue app ships inside the APK (webDir). There is no server.url, so the
// WebView never loads remote code; all API calls go to https://point.aryuki.com/api/v1.
const debug = process.env.CAP_DEBUG === '1'

const config: CapacitorConfig = {
  appId: 'com.aryuki.tickpoint',
  appName: 'TickPoint',
  webDir: 'www',
  server: {
    androidScheme: 'https',
    hostname: 'localhost',
    cleartext: false,
  },
  android: {
    webContentsDebuggingEnabled: debug,
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 300,
      backgroundColor: '#f8f9fb',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Keyboard: {
      resize: 'native',
      resizeOnFullScreen: true,
    },
  },
}

export default config
